import { Router, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { buildQuerySystemPrompt, buildLintSystemPrompt } from '../agents/prompts';
import { queryTool, lintTool } from '../agents/schemas';
import { getEmbedding, cosineSimilarity } from '../lib/embeddings';
import { runCorrectionSynthesis } from '../lib/cron';

const router = Router();
const client = new Anthropic();
const MODEL = 'claude-sonnet-4-6';

router.use(requireAuth);

router.post('/query', async (req: AuthRequest, res: Response): Promise<void> => {
  const { question } = req.body;
  if (!question) { res.status(400).json({ error: 'question required' }); return; }

  const userId = req.userId!;

  // Load graph context
  const nodes = await prisma.node.findMany({
    where: { userId, status: 'COMMITTED' },
    select: { id: true, title: true, content: true, tags: true, domainBucket: true, activityScore: true },
  });

  if (nodes.length === 0) {
    res.json({ answer: 'Your graph is empty. Add some sources first.', citedNodeIds: [], followUpQuestions: [] });
    return;
  }

  // Retrieve top N most relevant nodes by embedding similarity
  const queryEmbedding = await getEmbedding(question);
  const nodeEmbeddings = await prisma.$queryRaw<Array<{ id: string; embedding: string }>>`
    SELECT id, embedding::text FROM "Node"
    WHERE "userId" = ${userId} AND status = 'COMMITTED' AND embedding IS NOT NULL
  `;

  const scored = nodeEmbeddings.map(n => ({
    id: n.id,
    score: cosineSimilarity(queryEmbedding, JSON.parse(n.embedding)),
  })).sort((a, b) => b.score - a.score).slice(0, 20);

  const topNodeIds = new Set(scored.map(n => n.id));
  const topNodes = nodes.filter(n => topNodeIds.has(n.id));

  const ctx = {
    nodes: topNodes,
    edges: await prisma.edge.findMany({
      where: { userId, status: 'COMMITTED', archived: false },
      select: { id: true, fromNodeId: true, toNodeId: true, type: true, weight: true },
    }),
    correctionRules: [],
  };

  const systemPrompt = buildQuerySystemPrompt(ctx);

  const session = await prisma.agentSession.create({
    data: { userId, trigger: 'QUERY' },
  });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    tools: [queryTool],
    tool_choice: { type: 'tool', name: 'answer_query' },
    messages: [{ role: 'user', content: question }],
  });

  const toolUse = response.content.find(b => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    res.status(500).json({ error: 'No response from agent' });
    return;
  }

  const result = toolUse.input as any;

  // Save new annotations from query
  for (const ann of result.newAnnotations ?? []) {
    await prisma.annotation.create({
      data: {
        nodeId: ann.nodeId,
        agentSessionId: session.id,
        content: ann.content,
        type: ann.type,
      },
    });
  }

  await prisma.agentSession.update({
    where: { id: session.id },
    data: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      completedAt: new Date(),
    },
  });

  res.json(result);
});

router.post('/lint', async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.userId!;

  const nodes = await prisma.node.findMany({
    where: { userId, status: 'COMMITTED' },
    select: { id: true, title: true, content: true, tags: true, domainBucket: true, activityScore: true },
  });

  if (nodes.length < 3) {
    res.json({ message: 'Not enough nodes to lint. Add more sources first.' });
    return;
  }

  const edges = await prisma.edge.findMany({
    where: { userId, status: 'COMMITTED', archived: false },
    select: { id: true, fromNodeId: true, toNodeId: true, type: true, weight: true },
  });

  const session = await prisma.agentSession.create({
    data: { userId, trigger: 'LINT' },
  });

  const graphSummary = nodes.map(n => `[${n.id}] "${n.title}": ${n.content}`).join('\n');
  const edgeSummary = edges.map(e => {
    const from = nodes.find(n => n.id === e.fromNodeId)?.title ?? e.fromNodeId;
    const to = nodes.find(n => n.id === e.toNodeId)?.title ?? e.toNodeId;
    return `"${from}" -[${e.type}]→ "${to}" (weight: ${e.weight.toFixed(2)})`;
  }).join('\n');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: buildLintSystemPrompt(),
    tools: [lintTool],
    tool_choice: { type: 'tool', name: 'graph_health_report' },
    messages: [{ role: 'user', content: `Graph nodes:\n${graphSummary}\n\nEdges:\n${edgeSummary}` }],
  });

  const toolUse = response.content.find(b => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    res.status(500).json({ error: 'No response from agent' });
    return;
  }

  const result = toolUse.input as any;

  // Resolve node titles to IDs for the report
  const titleToId = Object.fromEntries(nodes.map(n => [n.title, n.id]));

  const report = await prisma.healthReport.create({
    data: {
      userId,
      contradictions: result.contradictions.map((c: any) => ({
        nodeAId: titleToId[c.nodeATitle],
        nodeBId: titleToId[c.nodeBTitle],
        nodeATitle: c.nodeATitle,
        nodeBTitle: c.nodeBTitle,
        reason: c.reason,
      })),
      orphans: result.orphans.map((t: string) => ({ nodeId: titleToId[t], title: t })),
      gaps: result.gaps,
      probableDupes: result.probableDuplicates.map((d: any) => ({
        nodeAId: titleToId[d.nodeATitle],
        nodeBId: titleToId[d.nodeBTitle],
        nodeATitle: d.nodeATitle,
        nodeBTitle: d.nodeBTitle,
        reason: d.reason,
      })),
      suggestedSources: result.suggestedSources,
    },
  });

  await prisma.agentSession.update({
    where: { id: session.id },
    data: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      completedAt: new Date(),
    },
  });

  res.json(report);
});

router.post('/correction-synthesis', async (req: AuthRequest, res: Response): Promise<void> => {
  const rules = await runCorrectionSynthesis(req.userId!);
  res.json({ rules });
});

router.get('/sessions', async (req: AuthRequest, res: Response): Promise<void> => {
  const sessions = await prisma.agentSession.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { source: { select: { type: true, url: true } } },
  });
  res.json(sessions);
});

export default router;
