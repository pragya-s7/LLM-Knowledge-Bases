import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const router = Router();

router.use(requireAuth);

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const [nodes, edges] = await Promise.all([
    prisma.node.findMany({
      where: { userId: req.userId!, status: { not: 'ARCHIVED' } },
      select: {
        id: true, title: true, content: true, tags: true,
        activityScore: true, status: true, confidence: true,
        domainBucket: true, sourceId: true, createdAt: true,
      },
    }),
    prisma.edge.findMany({
      where: { userId: req.userId!, archived: false },
      select: {
        id: true, fromNodeId: true, toNodeId: true, weight: true,
        type: true, sourceCitation: true, confidence: true,
        status: true, lastActivated: true,
      },
    }),
  ]);
  res.json({ nodes, edges });
});

router.get('/delta', async (req: AuthRequest, res: Response): Promise<void> => {
  const since = req.query.since as string;
  if (!since) {
    res.status(400).json({ error: 'since param required' });
    return;
  }
  const sinceDate = new Date(since);

  const [nodes, edges] = await Promise.all([
    prisma.node.findMany({
      where: { userId: req.userId!, updatedAt: { gt: sinceDate }, status: { not: 'ARCHIVED' } },
      select: {
        id: true, title: true, content: true, tags: true,
        activityScore: true, status: true, confidence: true,
        domainBucket: true, sourceId: true, createdAt: true, updatedAt: true,
      },
    }),
    prisma.edge.findMany({
      where: { userId: req.userId!, updatedAt: { gt: sinceDate }, archived: false },
      select: {
        id: true, fromNodeId: true, toNodeId: true, weight: true,
        type: true, sourceCitation: true, confidence: true,
        status: true, lastActivated: true, updatedAt: true,
      },
    }),
  ]);
  res.json({ nodes, edges, asOf: new Date().toISOString() });
});

export default router;
