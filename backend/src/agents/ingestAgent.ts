import OpenAI from 'openai';
import { Server } from 'socket.io';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { GraphContext, ExtractionResult, EdgeResult, DeduplicationResult } from './types';
import {
  buildExtractionSystemPrompt,
  buildEdgeSystemPrompt,
} from './prompts';
import { getEmbedding, cosineSimilarity } from '../lib/embeddings';
import { jsonrepair } from 'jsonrepair';

function parseJson<T>(text: string): T {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenceMatch ? fenceMatch[1].trim() : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  const jsonStr = start !== -1 && end !== -1 ? raw.slice(start, end + 1) : raw;
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    return JSON.parse(jsonrepair(jsonStr)) as T;
  }
}

const client = new OpenAI({
  baseURL: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1',
  apiKey: 'ollama',
});
const MODEL = process.env.OLLAMA_MODEL ?? 'gemma4';
const AUTO_COMMIT_THRESHOLD = 0.75;
const DEDUP_SIMILARITY_THRESHOLD = 0.88;

export async function runIngestAgent(
  userId: string,
  sourceId: string,
  sourceContent: string,
  intentSignal: string | undefined,
  io: Server
): Promise<void> {
  const sessionId = await createSession(userId, sourceId);
  io.to(userId).emit('agent:start', { sessionId, sourceId });

  try {
    const graphCtx = await loadGraphContext(userId);

    // Step 1: Extract nodes
    io.to(userId).emit('agent:thinking', { message: 'Extracting concepts from source…' });
    const extraction = await runExtractionPrompt(sourceContent, graphCtx, intentSignal);
    console.log(`[Ingest] Extraction returned ${(extraction.newNodes ?? []).length} candidates`);

    // Step 2: Deduplication against existing committed nodes
    io.to(userId).emit('agent:thinking', { message: 'Checking for duplicates…' });
    const { kept, merged } = await deduplicateNodes(extraction.newNodes ?? [], graphCtx, userId, sessionId);
    console.log(`[Ingest] After dedup: ${kept.length} kept, ${merged} merged`);

    // Filter out schema-template placeholders the model sometimes emits literally
    const PLACEHOLDER_TITLES = new Set(['string', 'title', 'node title', 'example']);
    const validKept = kept.filter(c => {
      const t = typeof c.title === 'string' ? c.title.trim() : '';
      return t.length > 0 && !PLACEHOLDER_TITLES.has(t.toLowerCase()) && t !== 'String';
    });
    if (validKept.length < kept.length) {
      console.log(`[Ingest] Filtered ${kept.length - validKept.length} placeholder nodes`);
    }

    // Step 3: Write candidate nodes as PENDING
    const createdNodes = await writeNodes(validKept, userId, sourceId, sessionId, io);
    console.log(`[Ingest] Wrote ${createdNodes.length} nodes`);
    const allNodes = [...graphCtx.nodes, ...createdNodes.map(n => ({
      id: n.id, title: n.title, content: n.content,
      tags: n.tags, domainBucket: n.domainBucket, activityScore: n.activityScore,
    }))];

    // Step 4: Draw edges
    io.to(userId).emit('agent:thinking', { message: 'Drawing edges…' });
    const edgeCtx: GraphContext = { ...graphCtx, nodes: allNodes };
    const edgeResult = await runEdgePrompt(sourceContent, edgeCtx, intentSignal);

    // Step 5: Write edges as PENDING
    await writeEdges(edgeResult, allNodes, userId, sessionId, io);

    // Step 6: Write annotations
    await writeAnnotations(edgeResult, allNodes, sessionId);

    // Step 7: Strengthen existing edges
    await strengthenEdges(edgeResult.strengthenEdgeTitles, allNodes, userId);

    // Step 8: Complete session
    await finalizeSession(sessionId, {
      nodesCreated: createdNodes.length,
      edgesCreated: (edgeResult.newEdges ?? []).length,
      edgesStrengthened: (edgeResult.strengthenEdgeTitles ?? []).length,
      merged,
    });

    io.to(userId).emit('agent:complete', {
      sessionId,
      synthesisSummary: extraction.synthesisSummary,
      nodesCreated: createdNodes.length,
      edgesCreated: (edgeResult.newEdges ?? []).length,
      merged,
    });
  } catch (err) {
    console.error('Ingest agent error:', err);
    await prisma.agentSession.update({
      where: { id: sessionId },
      data: { completedAt: new Date() },
    });
    io.to(userId).emit('agent:error', { sessionId, message: String(err) });
  }
}

async function runExtractionPrompt(
  content: string,
  ctx: GraphContext,
  intentSignal?: string
): Promise<ExtractionResult> {
  const systemPrompt = buildExtractionSystemPrompt(ctx, intentSignal);
  console.log('[Ingest] Extraction system prompt (first 600 chars):\n', systemPrompt.slice(0, 600));
  console.log('[Ingest] Source content chars:', content.length, '| Sending first', Math.min(content.length, 8000), 'chars');
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 8192,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Extract knowledge nodes from this source:\n\n${content.slice(0, 8000)}` },
    ],
  });

  const text = response.choices[0].message.content;
  if (!text) throw new Error('No content in extraction response');
  console.log('[Ingest] Raw extraction response (first 500 chars):', text.slice(0, 500));
  return parseJson<ExtractionResult>(text);
}

async function runEdgePrompt(
  content: string,
  ctx: GraphContext,
  intentSignal?: string
): Promise<EdgeResult> {
  const systemPrompt = buildEdgeSystemPrompt(ctx, intentSignal);
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 8192,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Draw edges for this source:\n\n${content.slice(0, 8000)}` },
    ],
  });

  const text = response.choices[0].message.content;
  if (!text) throw new Error('No content in edge response');
  return parseJson<EdgeResult>(text);
}

async function deduplicateNodes(
  candidates: ExtractionResult['newNodes'],
  ctx: GraphContext,
  userId: string,
  sessionId: string
): Promise<{ kept: ExtractionResult['newNodes']; merged: number }> {
  if (ctx.nodes.length === 0 || (candidates ?? []).length === 0) return { kept: candidates ?? [], merged: 0 };

  const existingWithEmbeddings = await prisma.$queryRaw<Array<{ id: string; title: string; embedding: number[] }>>`
    SELECT id, title, embedding::text
    FROM "Node"
    WHERE "userId" = ${userId}
    AND status = 'COMMITTED'::"NodeStatus"
    AND embedding IS NOT NULL
  `;

  const similarPairs: Array<{ newTitle: string; existingTitle: string; similarity: number }> = [];

  for (const candidate of candidates) {
    const embedding = await getEmbedding(candidate.title + ' ' + candidate.content);
    for (const existing of existingWithEmbeddings) {
      const existingEmbedding = typeof existing.embedding === 'string'
        ? JSON.parse(existing.embedding)
        : existing.embedding;
      const sim = cosineSimilarity(embedding, existingEmbedding);
      if (sim > DEDUP_SIMILARITY_THRESHOLD) {
        similarPairs.push({ newTitle: candidate.title, existingTitle: existing.title, similarity: sim });
      }
    }
  }

  if (similarPairs.length === 0) return { kept: candidates, merged: 0 };

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    response_format: { type: 'json_object' },
    messages: [{
      role: 'user',
      content: `These new node candidates are similar to existing nodes. Decide for each: MERGE (same concept), SPECIALIZE (subtype), CONTRADICT (conflicting claim), or DISTINCT (genuinely different).\n\nPairs:\n${similarPairs.map(p => `- New: "${p.newTitle}" vs Existing: "${p.existingTitle}" (similarity: ${p.similarity.toFixed(2)})`).join('\n')}\n\nReturn ONLY valid JSON, no prose: {"decisions":[{"newNodeTitle":"string","existingNodeTitle":"string","decision":"MERGE"}]}`,
    }],
  });

  const text = response.choices[0].message.content;
  if (!text) return { kept: candidates, merged: 0 };
  const result = parseJson<DeduplicationResult>(text);

  const toMerge = new Set(
    result.decisions
      .filter(d => d.decision === 'MERGE')
      .map(d => d.newNodeTitle)
  );

  return {
    kept: candidates.filter(c => !toMerge.has(c.title)),
    merged: toMerge.size,
  };
}

async function writeNodes(
  candidates: ExtractionResult['newNodes'],
  userId: string,
  sourceId: string,
  sessionId: string,
  io: Server
) {
  const created = [];

  for (const candidate of candidates) {
    const title = (typeof candidate.title === 'string' ? candidate.title : '').trim();
    const content = (
      (typeof candidate.content === 'string' && candidate.content.trim()) ||
      (typeof (candidate as any).description === 'string' && (candidate as any).description.trim()) ||
      (typeof (candidate as any).summary === 'string' && (candidate as any).summary.trim()) ||
      title
    );
    const confidence = typeof candidate.confidence === 'number' ? candidate.confidence : 0.5;

    if (!title || !content) {
      console.warn('[Ingest] Skipping candidate with missing title/content:', JSON.stringify(candidate).slice(0, 100));
      continue;
    }

    const embedding = await getEmbedding(title + ' ' + content);
    const autoCommit = confidence >= AUTO_COMMIT_THRESHOLD;

    const node = await prisma.node.create({
      data: {
        userId,
        sourceId,
        title,
        content,
        tags: Array.isArray(candidate.tags) ? candidate.tags.filter((t: any) => typeof t === 'string') : [],
        activityScore: 0.5,
        agentGenerated: true,
        status: autoCommit ? 'COMMITTED' : 'PENDING',
        confidence,
        domainBucket: candidate.domainBucket ?? null,
      },
      select: { id: true, title: true, content: true, tags: true, activityScore: true, domainBucket: true, status: true, confidence: true },
    });

    // Set embedding separately via raw SQL (Prisma doesn't support vector type natively)
    const embeddingRaw = Prisma.raw(`'[${embedding.join(',')}]'::vector`);
    await prisma.$executeRaw`
      UPDATE "Node" SET embedding = ${embeddingRaw} WHERE id = ${node.id}
    `;

    created.push(node);

    const event = autoCommit ? 'node:created' : 'node:pending';
    io.to(userId).emit(event, {
      id: node.id, title: node.title, content: node.content, tags: node.tags ?? [],
      activityScore: node.activityScore, domainBucket: node.domainBucket,
      status: node.status, confidence: node.confidence, sourceId,
    });
  }

  return created;
}

async function writeEdges(
  edgeResult: EdgeResult,
  allNodes: GraphContext['nodes'],
  userId: string,
  sessionId: string,
  io: Server
) {
  for (const proposal of edgeResult.newEdges ?? []) {
    const fromNode = allNodes.find(n => n.title === proposal.fromNodeTitle);
    const toNode = allNodes.find(n => n.title === proposal.toNodeTitle);
    if (!fromNode || !toNode) continue;

    const autoCommit = proposal.confidence >= AUTO_COMMIT_THRESHOLD;

    const edge = await prisma.edge.create({
      data: {
        userId,
        fromNodeId: fromNode.id,
        toNodeId: toNode.id,
        type: 'ASSOCIATIVE',
        sourceCitation: proposal.sourceCitation,
        confidence: proposal.confidence,
        status: autoCommit ? 'COMMITTED' : 'PENDING',
        weight: 0.5,
        lastActivated: new Date(),
      },
    });

    const event = autoCommit ? 'edge:created' : 'edge:pending';
    io.to(userId).emit(event, {
      id: edge.id, fromNodeId: edge.fromNodeId, toNodeId: edge.toNodeId,
      type: edge.type, weight: edge.weight, sourceCitation: edge.sourceCitation,
      confidence: edge.confidence, status: edge.status,
    });
  }
}

const VALID_ANNOTATION_TYPES = new Set(['SUMMARY', 'INSIGHT', 'CONTRADICTION', 'OPEN_QUESTION', 'SYNTHESIS']);

async function writeAnnotations(
  edgeResult: EdgeResult,
  allNodes: GraphContext['nodes'],
  sessionId: string
) {
  for (const ann of edgeResult.annotations ?? []) {
    const node = allNodes.find(n => n.title === ann.nodeTitle);
    if (!node) continue;
    const type = VALID_ANNOTATION_TYPES.has(ann.type) ? ann.type : 'INSIGHT';
    await prisma.annotation.create({
      data: {
        nodeId: node.id,
        agentSessionId: sessionId,
        content: ann.content,
        type: type as any,
      },
    });
  }
}

async function strengthenEdges(
  pairs: string[][],
  allNodes: GraphContext['nodes'],
  userId: string
) {
  for (const pair of pairs ?? []) {
    if (pair.length < 2) continue;
    const nodeA = allNodes.find(n => n.title === pair[0]);
    const nodeB = allNodes.find(n => n.title === pair[1]);
    if (!nodeA || !nodeB) continue;

    const edge = await prisma.edge.findFirst({
      where: {
        userId,
        status: 'COMMITTED',
        OR: [
          { fromNodeId: nodeA.id, toNodeId: nodeB.id },
          { fromNodeId: nodeB.id, toNodeId: nodeA.id },
        ],
      },
    });

    if (!edge) continue;
    const newWeight = Math.min(1.0, edge.weight + 0.15 * (1 - edge.weight));
    await prisma.edge.update({
      where: { id: edge.id },
      data: { weight: newWeight, lastActivated: new Date() },
    });
  }
}

async function loadGraphContext(userId: string): Promise<GraphContext> {
  const [nodes, edges, profile] = await Promise.all([
    prisma.node.findMany({
      where: { userId, status: { not: 'ARCHIVED' } },
      select: { id: true, title: true, content: true, tags: true, domainBucket: true, activityScore: true },
    }),
    prisma.edge.findMany({
      where: { userId, status: 'COMMITTED', archived: false },
      select: { id: true, fromNodeId: true, toNodeId: true, type: true, weight: true },
    }),
    prisma.userCorrectionProfile.findUnique({ where: { userId } }),
  ]);

  return { nodes, edges, correctionRules: profile?.rules ?? [] };
}

async function createSession(userId: string, sourceId: string): Promise<string> {
  const session = await prisma.agentSession.create({
    data: { userId, sourceId, trigger: 'INGEST' },
  });
  return session.id;
}

async function finalizeSession(
  sessionId: string,
  stats: { nodesCreated: number; edgesCreated: number; edgesStrengthened: number; merged: number }
) {
  await prisma.agentSession.update({
    where: { id: sessionId },
    data: {
      nodesCreated: stats.nodesCreated,
      edgesCreated: stats.edgesCreated,
      edgesStrengthened: stats.edgesStrengthened,
      completedAt: new Date(),
    },
  });
}
