import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const router = Router();
router.use(requireAuth);

router.get('/corrections', async (req: AuthRequest, res: Response): Promise<void> => {
  const profile = await prisma.userCorrectionProfile.findUnique({
    where: { userId: req.userId! },
  });
  res.json(profile ?? { rules: [], version: 0, generatedAt: null });
});

router.patch('/corrections', async (req: AuthRequest, res: Response): Promise<void> => {
  const { rules } = req.body;
  if (!Array.isArray(rules) || !rules.every(r => typeof r === 'string')) {
    res.status(400).json({ error: 'rules must be an array of strings' });
    return;
  }

  const updated = await prisma.userCorrectionProfile.upsert({
    where: { userId: req.userId! },
    create: { userId: req.userId!, rules, version: 1, generatedAt: new Date() },
    update: { rules },
  });
  res.json(updated);
});

export default router;
