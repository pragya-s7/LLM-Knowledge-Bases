import OpenAI from 'openai';
import { Server } from 'socket.io';
import { prisma } from '../lib/prisma';
import { GraphContext, ExtractionResult, EdgeResult, DeduplicationResult } from './types';
import {
  buildExtractionSystemPrompt,
  buildEdgeSystemPrompt,
} from './prompts';
import { extractionTool, edgeTool, deduplicationTool } from './schemas';
import { getEmbedding, cosineSimilarity } from '../lib/embeddings';

const client = new OpenAI({
  baseURL: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1',
  apiKey: 'ollama',
});
const MODEL = process.env.OLLAMA_MODEL ?? 'gemma4';
const AUTO_COMMIT_THRESHOLD = 0.85;
const DEDUP_SIMILARITY_THRESHOLD = 0.85;

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

    // Step 2: Deduplication against existing committed nodes
    io.to(userId).emit('agent:thinking', { message: 'Checking for duplicates…' });
    const { kept, merged } = await deduplicateNodes(extraction.newNodes, graphCtx, userId, sessionId);

    // Step 3: Write candidate nodes as PENDING
    const createdNodes = await writeNodes(kept, userId, sourceId, sessionId, io);
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
      edgesCreated: edgeResult.newEdges.length,
      edgesStrengthened: edgeResult.strengthenEdgeTitles.length,
      merged,
    });

    io.to(userId).emit('agent:complete', {
      sessionId,
      synthesisSummary: extraction.synthesisSummary,
      nodesCreated: createdNodes.length,
      edgesCreated: edgeResult.newEdges.length,
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
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 4096,
    tools: [extractionTool],
    tool_choice: { type: 'function', function: { name: 'extract_nodes' } },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Extract knowledge nodes from this source:\n\n${content.slice(0, 12000)}` },
    ],
  });

  const call = response.choices[0].message.tool_calls?.[0];
  if (!call) throw new Error('No tool call in extraction response');
  return JSON.parse(call.function.arguments) as ExtractionResult;
}

async function runEdgePrompt(
  content: string,
  ctx: GraphContext,
  intentSignal?: string
): Promise<EdgeResult> {
  const systemPrompt = buildEdgeSystemPrompt(ctx, intentSignal);
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 4096,
    tools: [edgeTool],
    tool_choice: { type: 'function', function: { name: 'draw_edges' } },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Draw edges for this source:\n\n${content.slice(0, 12000)}` },
    ],
  });

  const call = response.choices[0].message.tool_calls?.[0];
  if (!call) throw new Error('No tool call in edge response');
  return JSON.parse(call.function.arguments) as EdgeResult;
}

async function deduplicateNodes(
  candidates: ExtractionResult['newNodes'],
  ctx: GraphContext,
  userId: string,
  sessionId: string
): Promise<{ kept: ExtractionResult['newNodes']; merged: number }> {
  if (ctx.nodes.length === 0 || candidates.length === 0) return { kept: candidates, merged: 0 };

  const existingWithEmbeddings = await prisma.$queryRaw<Array<{ id: string; title: string; embedding: number[] }>>`
    SELECT id, title, embedding::text
    FROM "Node"
    WHERE "userId" = ${userId}
    AND status = 'COMMITTED'
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
    tools: [deduplicationTool],
    tool_choice: { type: 'function', function: { name: 'deduplicate_nodes' } },
    messages: [{
      role: 'user',
      content: `These new node candidates are similar to existing nodes. Decide: MERGE (same concept), SPECIALIZE (subtype), CONTRADICT (conflicting claim), or DISTINCT (genuinely different).\n\nPairs:\n${similarPairs.map(p => `- New: "${p.newTitle}" vs Existing: "${p.existingTitle}" (similarity: ${p.similarity.toFixed(2)})`).join('\n')}`,
    }],
  });

  const call = response.choices[0].message.tool_calls?.[0];
  if (!call) return { kept: candidates, merged: 0 };
  const result = JSON.parse(call.function.arguments) as DeduplicationResult;

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
    const embedding = await getEmbedding(candidate.title + ' ' + candidate.content);
    const autoCommit = candidate.confidence >= AUTO_COMMIT_THRESHOLD;

    const node = await prisma.$queryRaw<Array<{ id: string; title: string; content: string; tags: string[]; activityScore: number; domainBucket: string | null; status: string; confidence: number }>>`
      INSERT INTO "Node" (
        id, "userId", "sourceId", title, content, tags,
        "activityScore", "agentGenerated", status, confidence,
        embedding, "domainBucket", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(), ${userId}, ${sourceId}, ${candidate.title},
        ${candidate.content}, ${candidate.tags}, 0.5, true,
        ${autoCommit ? 'COMMITTED' : 'PENDING'}, ${candidate.confidence},
        ${`[${embedding.join(',')}]`}::vector, ${candidate.domainBucket},
        NOW(), NOW()
      )
      RETURNING id, title, content, tags, "activityScore", "domainBucket", status, confidence
    `;

    const n = node[0];
    created.push(n);

    const event = autoCommit ? 'node:created' : 'node:pending';
    io.to(userId).emit(event, {
      id: n.id, title: n.title, content: n.content, tags: n.tags,
      activityScore: n.activityScore, domainBucket: n.domainBucket,
      status: n.status, confidence: n.confidence, sourceId,
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
  for (const proposal of edgeResult.newEdges) {
    const fromNode = allNodes.find(n => n.title === proposal.fromNodeTitle);
    const toNode = allNodes.find(n => n.title === proposal.toNodeTitle);
    if (!fromNode || !toNode) continue;

    const autoCommit = proposal.confidence >= AUTO_COMMIT_THRESHOLD;

    const edge = await prisma.edge.create({
      data: {
        userId,
        fromNodeId: fromNode.id,
        toNodeId: toNode.id,
        type: proposal.type,
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

async function writeAnnotations(
  edgeResult: EdgeResult,
  allNodes: GraphContext['nodes'],
  sessionId: string
) {
  for (const ann of edgeResult.annotations) {
    const node = allNodes.find(n => n.title === ann.nodeTitle);
    if (!node) continue;
    await prisma.annotation.create({
      data: {
        nodeId: node.id,
        agentSessionId: sessionId,
        content: ann.content,
        type: ann.type,
      },
    });
  }
}

async function strengthenEdges(
  pairs: string[][],
  allNodes: GraphContext['nodes'],
  userId: string
) {
  for (const pair of pairs) {
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
