import { Router, Response } from 'express';
import multer from 'multer';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { fetchUrl, extractPdfText, hashUrl } from '../lib/ingest';
import { runIngestAgent } from '../agents/ingestAgent';
import { io } from '../index';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.use(requireAuth);

router.post('/ingest', upload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  const { type, url, text, intentSignal } = req.body;
  const userId = req.userId!;

  let rawContent = '';
  let sourceUrl: string | undefined;
  let urlHash: string | undefined;

  try {
    if (type === 'URL') {
      if (!url) { res.status(400).json({ error: 'url required' }); return; }
      urlHash = hashUrl(url);

      // Dedup check
      const existing = await prisma.source.findFirst({ where: { userId, urlHash } });
      if (existing) {
        res.status(409).json({ error: 'URL already ingested', sourceId: existing.id });
        return;
      }

      const { text: fetched } = await fetchUrl(url);
      rawContent = fetched;
      sourceUrl = url;
    } else if (type === 'PDF') {
      if (!req.file) { res.status(400).json({ error: 'file required' }); return; }
      rawContent = await extractPdfText(req.file.buffer);
    } else if (type === 'TEXT' || type === 'THOUGHT') {
      if (!text) { res.status(400).json({ error: 'text required' }); return; }
      rawContent = text;
    } else {
      res.status(400).json({ error: 'Invalid type. Must be URL | PDF | TEXT | THOUGHT' });
      return;
    }

    const source = await prisma.source.create({
      data: {
        userId,
        type,
        url: sourceUrl,
        urlHash,
        rawContent,
        intentSignal: intentSignal || null,
      },
    });

    // Respond immediately — agent runs async
    res.status(202).json({ sourceId: source.id, message: 'Ingest started' });

    // Run agent in background
    runIngestAgent(userId, source.id, rawContent, intentSignal, io).then(async () => {
      await prisma.source.update({ where: { id: source.id }, data: { processedAt: new Date() } });
    }).catch(console.error);

  } catch (err) {
    console.error('Ingest error:', err);
    res.status(500).json({ error: String(err) });
  }
});

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const sources = await prisma.source.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: 'desc' },
    select: { id: true, type: true, url: true, intentSignal: true, processedAt: true, createdAt: true },
  });
  res.json(sources);
});

router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const source = await prisma.source.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    include: {
      nodes: {
        select: { id: true, title: true, status: true, confidence: true },
      },
    },
  });
  if (!source) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(source);
});

export default router;
