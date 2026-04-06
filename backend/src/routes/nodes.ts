import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { io } from '../index';

const router = Router();
router.use(requireAuth);

router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const node = await prisma.node.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    include: {
      annotations: { orderBy: { createdAt: 'asc' } },
      edgesFrom: {
        where: { archived: false },
        include: { toNode: { select: { id: true, title: true } } },
      },
      edgesTo: {
        where: { archived: false },
        include: { fromNode: { select: { id: true, title: true } } },
      },
      source: { select: { id: true, type: true, url: true } },
    },
  });
  if (!node) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(node);
});

router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { title, content, tags, domainBucket } = req.body;
  const node = await prisma.node.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!node) { res.status(404).json({ error: 'Not found' }); return; }

  const updated = await prisma.node.update({
    where: { id: req.params.id },
    data: {
      ...(title && { title }),
      ...(content && { content }),
      ...(tags && { tags }),
      ...(domainBucket !== undefined && { domainBucket }),
    },
  });
  res.json(updated);
});

router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const node = await prisma.node.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!node) { res.status(404).json({ error: 'Not found' }); return; }
  await prisma.node.update({ where: { id: req.params.id }, data: { status: 'ARCHIVED' } });
  res.json({ ok: true });
});

router.post('/:id/feedback', async (req: AuthRequest, res: Response): Promise<void> => {
  const { action, newTitle, mergedIntoNodeId } = req.body;
  const validActions = ['APPROVED', 'RENAMED', 'REJECTED', 'MERGED'];
  if (!validActions.includes(action)) {
    res.status(400).json({ error: `action must be one of: ${validActions.join(', ')}` });
    return;
  }

  const node = await prisma.node.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!node) { res.status(404).json({ error: 'Not found' }); return; }

  await prisma.nodeFeedback.create({
    data: {
      userId: req.userId!,
      nodeId: req.params.id,
      action,
      newTitle: newTitle || null,
      mergedIntoNodeId: mergedIntoNodeId || null,
    },
  });

  // Apply feedback immediately
  if (action === 'APPROVED') {
    await prisma.node.update({ where: { id: req.params.id }, data: { status: 'COMMITTED' } });
    io.to(req.userId!).emit('node:created', { id: node.id });
  } else if (action === 'RENAMED' && newTitle) {
    await prisma.node.update({ where: { id: req.params.id }, data: { title: newTitle, status: 'COMMITTED' } });
    io.to(req.userId!).emit('node:created', { id: node.id, title: newTitle });
  } else if (action === 'REJECTED') {
    await prisma.node.update({ where: { id: req.params.id }, data: { status: 'ARCHIVED' } });
  } else if (action === 'MERGED' && mergedIntoNodeId) {
    // Move edges from rejected node to target, archive the duplicate
    await prisma.edge.updateMany({ where: { fromNodeId: req.params.id }, data: { fromNodeId: mergedIntoNodeId } });
    await prisma.edge.updateMany({ where: { toNodeId: req.params.id }, data: { toNodeId: mergedIntoNodeId } });
    await prisma.node.update({ where: { id: req.params.id }, data: { status: 'ARCHIVED' } });
  }

  res.json({ ok: true });
});

export default router;
