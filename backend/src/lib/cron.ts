import cron from 'node-cron';
import { prisma } from './prisma';
import Anthropic from '@anthropic-ai/sdk';
import { buildCorrectionSynthesisPrompt } from '../agents/prompts';

const DECAY_RATE = 0.05;
const ARCHIVE_FLOOR = 0.1;
const INACTIVE_DAYS = 7;
const AUTO_COMMIT_HOURS = 48;

export function setupCronJobs() {
  // Hebbian decay — runs daily at 3am
  cron.schedule('0 3 * * *', runDecay);

  // Correction synthesis — runs weekly on Sunday at 4am
  cron.schedule('0 4 * * 0', runCorrectionSynthesisForAllUsers);

  // Auto-commit stale pending items — runs every 6 hours
  cron.schedule('0 */6 * * *', autoCommitStalePending);

  console.log('Cron jobs scheduled: decay (daily), correction synthesis (weekly), auto-commit (6h)');
}

export async function runDecay() {
  const cutoff = new Date(Date.now() - INACTIVE_DAYS * 24 * 60 * 60 * 1000);

  const edges = await prisma.edge.findMany({
    where: {
      status: 'COMMITTED',
      archived: false,
      lastActivated: { lt: cutoff },
    },
    select: { id: true, weight: true },
  });

  for (const edge of edges) {
    const daysInactive = Math.floor(
      (Date.now() - new Date(cutoff).getTime()) / (24 * 60 * 60 * 1000)
    );
    const newWeight = edge.weight * Math.pow(1 - DECAY_RATE, daysInactive);

    if (newWeight < ARCHIVE_FLOOR) {
      await prisma.edge.update({
        where: { id: edge.id },
        data: { archived: true, weight: newWeight },
      });
    } else {
      await prisma.edge.update({
        where: { id: edge.id },
        data: { weight: newWeight },
      });
    }
  }

  console.log(`Decay run complete: processed ${edges.length} edges`);
}

async function runCorrectionSynthesisForAllUsers() {
  const users = await prisma.user.findMany({ select: { id: true } });
  for (const user of users) {
    await runCorrectionSynthesis(user.id);
  }
}

export async function runCorrectionSynthesis(userId: string): Promise<string[]> {
  const [nodeFeedback, edgeFeedback] = await Promise.all([
    prisma.nodeFeedback.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 40,
      include: { node: { select: { title: true, domainBucket: true } } },
    }),
    prisma.edgeFeedback.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 40,
      include: { edge: { include: { fromNode: { select: { title: true } }, toNode: { select: { title: true } } } } },
    }),
  ]);

  if (nodeFeedback.length + edgeFeedback.length < 5) return [];

  const feedbackSummary = [
    ...nodeFeedback.map(f => `Node "${f.node.title}" (domain: ${f.node.domainBucket}): ${f.action}${f.newTitle ? ` → "${f.newTitle}"` : ''}`),
    ...edgeFeedback.map(f => `Edge "${f.edge.fromNode.title}" → "${f.edge.toNode.title}": rejected (${f.reason})`),
  ].join('\n');

  const client = new Anthropic();
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: buildCorrectionSynthesisPrompt(),
    messages: [{
      role: 'user',
      content: `Here are the user's recent corrections:\n\n${feedbackSummary}\n\nGenerate up to 5 rules.`,
    }],
  });

  const text = response.content.find(b => b.type === 'text')?.text ?? '[]';
  try {
    const rules = JSON.parse(text) as string[];
    const existing = await prisma.userCorrectionProfile.findUnique({ where: { userId } });
    await prisma.userCorrectionProfile.upsert({
      where: { userId },
      create: { userId, rules, version: 1, generatedAt: new Date() },
      update: { rules, version: (existing?.version ?? 0) + 1, generatedAt: new Date() },
    });
    return rules;
  } catch {
    console.error('Failed to parse correction synthesis rules');
    return [];
  }
}

async function autoCommitStalePending() {
  const cutoff = new Date(Date.now() - AUTO_COMMIT_HOURS * 60 * 60 * 1000);

  await prisma.node.updateMany({
    where: { status: 'PENDING', confidence: { gte: 0.85 }, createdAt: { lt: cutoff } },
    data: { status: 'COMMITTED' },
  });

  await prisma.node.updateMany({
    where: { status: 'PENDING', confidence: { lt: 0.5 }, createdAt: { lt: cutoff } },
    data: { status: 'ARCHIVED' },
  });

  await prisma.edge.updateMany({
    where: { status: 'PENDING', confidence: { gte: 0.85 }, createdAt: { lt: cutoff } },
    data: { status: 'COMMITTED' },
  });

  await prisma.edge.updateMany({
    where: { status: 'PENDING', confidence: { lt: 0.5 }, createdAt: { lt: cutoff } },
    data: { status: 'ARCHIVED' },
  });
}
