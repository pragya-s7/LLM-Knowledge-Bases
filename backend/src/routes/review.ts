import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { io } from '../app';

const router = Router();
router.use(requireAuth);

router.get('/pending', async (req: AuthRequest, res: Response): Promise<void> => {
  const [nodes, edges] = await Promise.all([
    prisma.node.findMany({
      where: { userId: req.userId!, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, title: true, content: true, tags: true,
        confidence: true, domainBucket: true, sourceId: true, createdAt: true,
      },
    }),
    prisma.edge.findMany({
      where: { userId: req.userId!, status: 'PENDING', archived: false },
      orderBy: { createdAt: 'desc' },
      include: {
        fromNode: { select: { id: true, title: true } },
        toNode: { select: { id: true, title: true } },
      },
    }),
  ]);
  res.json({ nodes, edges });
});

router.post('/commit', async (req: AuthRequest, res: Response): Promise<void> => {
  const { nodeIds = [], edgeIds = [] } = req.body;
  const userId = req.userId!;

  if (nodeIds.length > 0) {
    // Verify ownership
    await prisma.node.updateMany({
      where: { id: { in: nodeIds }, userId, status: 'PENDING' },
      data: { status: 'COMMITTED' },
    });
    for (const id of nodeIds) {
      io.to(userId).emit('node:created', { id });
    }
  }

  if (edgeIds.length > 0) {
    await prisma.edge.updateMany({
      where: { id: { in: edgeIds }, userId, status: 'PENDING' },
      data: { status: 'COMMITTED' },
    });
    for (const id of edgeIds) {
      io.to(userId).emit('edge:created', { id });
    }
  }

  res.json({ committed: { nodes: nodeIds.length, edges: edgeIds.length } });
});

router.post('/reject', async (req: AuthRequest, res: Response): Promise<void> => {
  const { nodeIds = [], edgeIds = [], nodeReason, edgeReason } = req.body;
  const userId = req.userId!;

  if (nodeIds.length > 0) {
    await prisma.node.updateMany({
      where: { id: { in: nodeIds }, userId, status: 'PENDING' },
      data: { status: 'ARCHIVED' },
    });
    if (nodeReason) {
      await prisma.nodeFeedback.createMany({
        data: nodeIds.map((id: string) => ({ userId, nodeId: id, action: 'REJECTED' })),
      });
    }
  }

  if (edgeIds.length > 0) {
    await prisma.edge.updateMany({
      where: { id: { in: edgeIds }, userId, status: 'PENDING' },
      data: { archived: true },
    });
    if (edgeReason) {
      // edgeReason must be a valid EdgeFeedbackReason
      const validReasons = ['NOT_RELATED', 'WRONG_TYPE', 'CONTEXT_SPECIFIC'];
      if (validReasons.includes(edgeReason)) {
        await prisma.edgeFeedback.createMany({
          data: edgeIds.map((id: string) => ({ userId, edgeId: id, reason: edgeReason })),
        });
      }
    }
  }

  res.json({ rejected: { nodes: nodeIds.length, edges: edgeIds.length } });
});

export default router;
