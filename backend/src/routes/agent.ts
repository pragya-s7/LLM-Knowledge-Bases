import { Router, Response } from 'express';
import OpenAI from 'openai';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { buildQuerySystemPrompt } from '../agents/prompts';
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

const router = Router();
const client = new OpenAI({
  baseURL: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1',
  apiKey: 'ollama',
});
const MODEL = process.env.OLLAMA_MODEL ?? 'gemma4';

router.use(requireAuth);

router.post('/query', async (req: AuthRequest, res: Response): Promise<void> => {
  const { question } = req.body;
  if (!question) { res.status(400).json({ error: 'question required' }); return; }

  const userId = req.userId!;

  const nodes = await prisma.node.findMany({
    where: { userId, status: 'COMMITTED' },
    select: { id: true, title: true, content: true, tags: true, domainBucket: true, activityScore: true },
  });

  if (nodes.length === 0) {
    res.json({ answer: 'Your graph is empty. Add some sources first.', citedNodeIds: [], followUpQuestions: [] });
    return;
  }

  const queryEmbedding = await getEmbedding(question);
  const nodeEmbeddings = await prisma.$queryRaw<Array<{ id: string; embedding: string }>>`
    SELECT id, embedding::text FROM "Node"
    WHERE "userId" = ${userId} AND status = 'COMMITTED'::"NodeStatus" AND embedding IS NOT NULL
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

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 8192,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question },
    ],
  });

  const text = response.choices[0].message.content;
  if (!text) {
    res.status(500).json({ error: 'No response from agent' });
    return;
  }

  const result = parseJson<any>(text);

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
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      completedAt: new Date(),
    },
  });

  res.json(result);
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
