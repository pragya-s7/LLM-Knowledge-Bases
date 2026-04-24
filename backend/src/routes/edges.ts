import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
const router = Router();
router.use(requireAuth);

router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { fromNodeId, toNodeId, type, sourceCitation, weight } = req.body;
  if (!fromNodeId || !toNodeId || !type || !sourceCitation) {
    res.status(400).json({ error: 'fromNodeId, toNodeId, type, sourceCitation required' });
    return;
  }

  const edge = await prisma.edge.create({
    data: {
      userId: req.userId!,
      fromNodeId,
      toNodeId,
      type,
      sourceCitation,
      weight: weight ?? 0.5,
      confidence: 1.0, // user-created edges are fully confident
      status: 'COMMITTED',
      lastActivated: new Date(),
    },
  });
  res.status(201).json(edge);
});

router.patch('/:id/weight', async (req: AuthRequest, res: Response): Promise<void> => {
  const { weight } = req.body;
  if (typeof weight !== 'number' || weight < 0 || weight > 1) {
    res.status(400).json({ error: 'weight must be a number between 0 and 1' });
    return;
  }

  const edge = await prisma.edge.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!edge) { res.status(404).json({ error: 'Not found' }); return; }

  const updated = await prisma.edge.update({
    where: { id: req.params.id },
    data: { weight, lastActivated: new Date() },
  });
  res.json(updated);
});

router.post('/:id/feedback', async (req: AuthRequest, res: Response): Promise<void> => {
  const { reason } = req.body;
  const validReasons = ['NOT_RELATED', 'WRONG_TYPE', 'CONTEXT_SPECIFIC'];
  if (!validReasons.includes(reason)) {
    res.status(400).json({ error: `reason must be one of: ${validReasons.join(', ')}` });
    return;
  }

  const edge = await prisma.edge.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!edge) { res.status(404).json({ error: 'Not found' }); return; }

  await prisma.edgeFeedback.create({
    data: { userId: req.userId!, edgeId: req.params.id, reason },
  });

  // Archive the rejected edge
  await prisma.edge.update({ where: { id: req.params.id }, data: { archived: true } });
  res.json({ ok: true });
});


export default router;
