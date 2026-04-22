import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TEST_EMAIL = `test-${Date.now()}@mindgraph.test`;
const TEST_PASSWORD = 'TestPassword123!';

let authToken: string;
let userId: string;

async function register(email = TEST_EMAIL, password = TEST_PASSWORD) {
  const res = await request(app)
    .post('/auth/register')
    .send({ email, password });
  return res;
}

async function login(email = TEST_EMAIL, password = TEST_PASSWORD) {
  const res = await request(app)
    .post('/auth/login')
    .send({ email, password });
  return res;
}

function auth(req: request.Test) {
  return req.set('Authorization', `Bearer ${authToken}`);
}

async function createNode(overrides: Record<string, unknown> = {}) {
  const node = await prisma.node.create({
    data: {
      userId,
      title: overrides.title as string ?? 'Test Node',
      content: overrides.content as string ?? 'This is test node content.',
      tags: overrides.tags as string[] ?? ['test'],
      activityScore: 0.5,
      agentGenerated: true,
      status: overrides.status as any ?? 'COMMITTED',
      confidence: overrides.confidence as number ?? 0.9,
      domainBucket: overrides.domainBucket as string ?? null,
    },
  });
  return node;
}

async function createEdge(fromNodeId: string, toNodeId: string, overrides: Record<string, unknown> = {}) {
  const edge = await prisma.edge.create({
    data: {
      userId,
      fromNodeId,
      toNodeId,
      type: 'ASSOCIATIVE',
      sourceCitation: 'Test citation',
      weight: overrides.weight as number ?? 0.5,
      confidence: 0.9,
      status: overrides.status as any ?? 'COMMITTED',
      lastActivated: new Date(),
    },
  });
  return edge;
}

// ─── Setup / Teardown ────────────────────────────────────────────────────────

beforeAll(async () => {
  const res = await register();
  expect(res.status).toBe(201);
  authToken = res.body.token;
  userId = res.body.user.id;
});

afterAll(async () => {
  // Clean up all test data for this user
  await prisma.edgeFeedback.deleteMany({ where: { userId } });
  await prisma.nodeFeedback.deleteMany({ where: { userId } });
  await prisma.healthReport.deleteMany({ where: { userId } });
  await prisma.agentSession.deleteMany({ where: { userId } });
  await prisma.annotation.deleteMany({
    where: { node: { userId } },
  });
  await prisma.edge.deleteMany({ where: { userId } });
  await prisma.node.deleteMany({ where: { userId } });
  await prisma.source.deleteMany({ where: { userId } });
  await prisma.userCorrectionProfile.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe('Auth', () => {
  it('POST /auth/register → 400 when missing fields', async () => {
    const res = await request(app).post('/auth/register').send({ email: 'a@b.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/password/i);
  });

  it('POST /auth/register → 409 on duplicate email', async () => {
    const res = await register();
    expect(res.status).toBe(409);
  });

  it('POST /auth/login → 200 with valid credentials', async () => {
    const res = await login();
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe(TEST_EMAIL);
  });

  it('POST /auth/login → 401 with wrong password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: TEST_EMAIL, password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('GET /auth/me → 200 with valid token', async () => {
    const res = await auth(request(app).get('/auth/me'));
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(TEST_EMAIL);
  });

  it('GET /auth/me → 401 without token', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('GET /auth/me → 401 with invalid token', async () => {
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
  });
});

// ─── Health ───────────────────────────────────────────────────────────────────

describe('Health', () => {
  it('GET /health → 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ─── Graph ────────────────────────────────────────────────────────────────────

describe('Graph', () => {
  it('GET /graph → 401 without token', async () => {
    const res = await request(app).get('/graph');
    expect(res.status).toBe(401);
  });

  it('GET /graph → 200 with nodes and edges arrays', async () => {
    const res = await auth(request(app).get('/graph'));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.nodes)).toBe(true);
    expect(Array.isArray(res.body.edges)).toBe(true);
  });

  it('GET /graph/delta → 400 without since param', async () => {
    const res = await auth(request(app).get('/graph/delta'));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/since/i);
  });

  it('GET /graph/delta → 200 with since param', async () => {
    const since = new Date(Date.now() - 60_000).toISOString();
    const res = await auth(request(app).get(`/graph/delta?since=${since}`));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.nodes)).toBe(true);
    expect(Array.isArray(res.body.edges)).toBe(true);
    expect(res.body.asOf).toBeTruthy();
  });

  it('GET /graph/delta only returns items updated after since', async () => {
    const before = new Date(Date.now() - 5000).toISOString();
    const node = await createNode({ title: 'Delta Test Node' });

    const res = await auth(request(app).get(`/graph/delta?since=${before}`));
    expect(res.status).toBe(200);
    const ids = res.body.nodes.map((n: any) => n.id);
    expect(ids).toContain(node.id);

    // Clean up
    await prisma.node.delete({ where: { id: node.id } });
  });
});

// ─── Nodes ────────────────────────────────────────────────────────────────────

describe('Nodes', () => {
  let nodeId: string;

  beforeAll(async () => {
    const node = await createNode({ title: 'Nodes Test Node', status: 'COMMITTED' });
    nodeId = node.id;
  });

  afterAll(async () => {
    await prisma.nodeFeedback.deleteMany({ where: { nodeId } });
    await prisma.annotation.deleteMany({ where: { nodeId } });
    await prisma.node.deleteMany({ where: { id: nodeId } });
  });

  it('GET /nodes/:id → 200 with node details', async () => {
    const res = await auth(request(app).get(`/nodes/${nodeId}`));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(nodeId);
    expect(res.body.title).toBe('Nodes Test Node');
    expect(Array.isArray(res.body.annotations)).toBe(true);
    expect(Array.isArray(res.body.edgesFrom)).toBe(true);
    expect(Array.isArray(res.body.edgesTo)).toBe(true);
  });

  it('GET /nodes/:id → 404 for non-existent node', async () => {
    const res = await auth(request(app).get('/nodes/00000000-0000-0000-0000-000000000000'));
    expect(res.status).toBe(404);
  });

  it('PATCH /nodes/:id → 200 updates title', async () => {
    const res = await auth(request(app).patch(`/nodes/${nodeId}`))
      .send({ title: 'Updated Title' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Title');
  });

  it('PATCH /nodes/:id → 200 updates tags', async () => {
    const res = await auth(request(app).patch(`/nodes/${nodeId}`))
      .send({ tags: ['updated', 'tags'] });
    expect(res.status).toBe(200);
    expect(res.body.tags).toEqual(['updated', 'tags']);
  });

  it('PATCH /nodes/:id → 404 for wrong user', async () => {
    // Create a second user's node and try to update it
    const otherUser = await prisma.user.create({
      data: { email: `other-${Date.now()}@test.com`, passwordHash: 'hash' },
    });
    const otherNode = await prisma.node.create({
      data: { userId: otherUser.id, title: 'Other', content: 'Other', tags: [], activityScore: 0.5, agentGenerated: false, status: 'COMMITTED', confidence: 0.5 },
    });

    const res = await auth(request(app).patch(`/nodes/${otherNode.id}`))
      .send({ title: 'Hacked' });
    expect(res.status).toBe(404);

    await prisma.node.delete({ where: { id: otherNode.id } });
    await prisma.user.delete({ where: { id: otherUser.id } });
  });

  it('DELETE /nodes/:id → 200 archives node', async () => {
    const node = await createNode({ title: 'To Delete' });
    const res = await auth(request(app).delete(`/nodes/${node.id}`));
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const check = await prisma.node.findUnique({ where: { id: node.id } });
    expect(check?.status).toBe('ARCHIVED');

    await prisma.node.delete({ where: { id: node.id } });
  });

  it('POST /nodes/:id/feedback APPROVED → commits node', async () => {
    const node = await createNode({ title: 'Pending Feedback', status: 'PENDING' });
    const res = await auth(request(app).post(`/nodes/${node.id}/feedback`))
      .send({ action: 'APPROVED' });
    expect(res.status).toBe(200);

    const check = await prisma.node.findUnique({ where: { id: node.id } });
    expect(check?.status).toBe('COMMITTED');

    await prisma.nodeFeedback.deleteMany({ where: { nodeId: node.id } });
    await prisma.node.delete({ where: { id: node.id } });
  });

  it('POST /nodes/:id/feedback RENAMED → commits with new title', async () => {
    const node = await createNode({ title: 'Old Title', status: 'PENDING' });
    const res = await auth(request(app).post(`/nodes/${node.id}/feedback`))
      .send({ action: 'RENAMED', newTitle: 'New Title' });
    expect(res.status).toBe(200);

    const check = await prisma.node.findUnique({ where: { id: node.id } });
    expect(check?.status).toBe('COMMITTED');
    expect(check?.title).toBe('New Title');

    await prisma.nodeFeedback.deleteMany({ where: { nodeId: node.id } });
    await prisma.node.delete({ where: { id: node.id } });
  });

  it('POST /nodes/:id/feedback REJECTED → archives node', async () => {
    const node = await createNode({ title: 'Reject Me', status: 'PENDING' });
    const res = await auth(request(app).post(`/nodes/${node.id}/feedback`))
      .send({ action: 'REJECTED' });
    expect(res.status).toBe(200);

    const check = await prisma.node.findUnique({ where: { id: node.id } });
    expect(check?.status).toBe('ARCHIVED');

    await prisma.nodeFeedback.deleteMany({ where: { nodeId: node.id } });
    await prisma.node.delete({ where: { id: node.id } });
  });

  it('POST /nodes/:id/feedback MERGED → archives node and redirects edges', async () => {
    const fromNode = await createNode({ title: 'From Node' });
    const targetNode = await createNode({ title: 'Target Node' });
    const dupNode = await createNode({ title: 'Duplicate Node', status: 'PENDING' });

    // Create an edge from dupNode to fromNode
    const edge = await createEdge(dupNode.id, fromNode.id);

    const res = await auth(request(app).post(`/nodes/${dupNode.id}/feedback`))
      .send({ action: 'MERGED', mergedIntoNodeId: targetNode.id });
    expect(res.status).toBe(200);

    // dupNode should be archived
    const check = await prisma.node.findUnique({ where: { id: dupNode.id } });
    expect(check?.status).toBe('ARCHIVED');

    // Edge should now point from targetNode
    const updatedEdge = await prisma.edge.findUnique({ where: { id: edge.id } });
    expect(updatedEdge?.fromNodeId).toBe(targetNode.id);

    // Cleanup
    await prisma.edge.delete({ where: { id: edge.id } });
    await prisma.nodeFeedback.deleteMany({ where: { nodeId: dupNode.id } });
    await prisma.node.deleteMany({ where: { id: { in: [fromNode.id, targetNode.id, dupNode.id] } } });
  });

  it('POST /nodes/:id/feedback → 400 for invalid action', async () => {
    const res = await auth(request(app).post(`/nodes/${nodeId}/feedback`))
      .send({ action: 'INVALID_ACTION' });
    expect(res.status).toBe(400);
  });
});

// ─── Edges ────────────────────────────────────────────────────────────────────

describe('Edges', () => {
  let nodeA: { id: string };
  let nodeB: { id: string };
  let edgeId: string;

  beforeAll(async () => {
    nodeA = await createNode({ title: 'Edge Node A' });
    nodeB = await createNode({ title: 'Edge Node B' });
  });

  afterAll(async () => {
    await prisma.edgeFeedback.deleteMany({ where: { edge: { userId } } });
    await prisma.edge.deleteMany({ where: { userId, fromNodeId: { in: [nodeA.id, nodeB.id] } } });
    await prisma.edge.deleteMany({ where: { userId, toNodeId: { in: [nodeA.id, nodeB.id] } } });
    await prisma.node.deleteMany({ where: { id: { in: [nodeA.id, nodeB.id] } } });
  });

  it('POST /edges → 201 creates an edge', async () => {
    const res = await auth(request(app).post('/edges'))
      .send({
        fromNodeId: nodeA.id,
        toNodeId: nodeB.id,
        type: 'ASSOCIATIVE',
        sourceCitation: 'Test citation',
        weight: 0.7,
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.weight).toBe(0.7);
    expect(res.body.status).toBe('COMMITTED');
    edgeId = res.body.id;
  });

  it('POST /edges → 400 when missing required fields', async () => {
    const res = await auth(request(app).post('/edges'))
      .send({ fromNodeId: nodeA.id, toNodeId: nodeB.id });
    expect(res.status).toBe(400);
  });

  it('PATCH /edges/:id/weight → 200 updates weight', async () => {
    const res = await auth(request(app).patch(`/edges/${edgeId}/weight`))
      .send({ weight: 0.9 });
    expect(res.status).toBe(200);
    expect(res.body.weight).toBe(0.9);
  });

  it('PATCH /edges/:id/weight → 400 for out-of-range weight', async () => {
    const res = await auth(request(app).patch(`/edges/${edgeId}/weight`))
      .send({ weight: 1.5 });
    expect(res.status).toBe(400);
  });

  it('PATCH /edges/:id/weight → 400 for negative weight', async () => {
    const res = await auth(request(app).patch(`/edges/${edgeId}/weight`))
      .send({ weight: -0.1 });
    expect(res.status).toBe(400);
  });

  it('POST /edges/:id/feedback → 200 archives edge', async () => {
    const edgeToArchive = await createEdge(nodeA.id, nodeB.id);
    const res = await auth(request(app).post(`/edges/${edgeToArchive.id}/feedback`))
      .send({ reason: 'NOT_RELATED' });
    expect(res.status).toBe(200);

    const check = await prisma.edge.findUnique({ where: { id: edgeToArchive.id } });
    expect(check?.archived).toBe(true);
  });

  it('POST /edges/:id/feedback → 400 for invalid reason', async () => {
    const res = await auth(request(app).post(`/edges/${edgeId}/feedback`))
      .send({ reason: 'INVALID_REASON' });
    expect(res.status).toBe(400);
  });

  it('POST /edges/:id/feedback → 404 for non-existent edge', async () => {
    const res = await auth(request(app).post('/edges/00000000-0000-0000-0000-000000000000/feedback'))
      .send({ reason: 'NOT_RELATED' });
    expect(res.status).toBe(404);
  });

  it('POST /edges/decay → 200 runs decay', async () => {
    const res = await auth(request(app).post('/edges/decay'));
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ─── Sources ─────────────────────────────────────────────────────────────────

describe('Sources', () => {
  let sourceId: string;

  it('POST /sources/ingest TEXT → 202 starts ingest', async () => {
    const res = await auth(request(app).post('/sources/ingest'))
      .send({ type: 'TEXT', text: 'Machine learning is a subset of artificial intelligence.' });
    expect(res.status).toBe(202);
    expect(res.body.sourceId).toBeTruthy();
    expect(res.body.message).toMatch(/ingest started/i);
    sourceId = res.body.sourceId;
  });

  it('POST /sources/ingest URL → 202 starts ingest', async () => {
    const res = await auth(request(app).post('/sources/ingest'))
      .send({ type: 'URL', url: 'https://example.com/article' });
    expect(res.status).toBe(202);
    expect(res.body.sourceId).toBeTruthy();
  });

  it('POST /sources/ingest URL → 409 on duplicate URL', async () => {
    const res = await auth(request(app).post('/sources/ingest'))
      .send({ type: 'URL', url: 'https://example.com/article' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already ingested/i);
  });

  it('POST /sources/ingest → 400 for invalid type', async () => {
    const res = await auth(request(app).post('/sources/ingest'))
      .send({ type: 'INVALID' });
    expect(res.status).toBe(400);
  });

  it('POST /sources/ingest TEXT → 400 when text missing', async () => {
    const res = await auth(request(app).post('/sources/ingest'))
      .send({ type: 'TEXT' });
    expect(res.status).toBe(400);
  });

  it('GET /sources → 200 returns sources list', async () => {
    const res = await auth(request(app).get('/sources'));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('GET /sources/:id → 200 returns source with nodes', async () => {
    const res = await auth(request(app).get(`/sources/${sourceId}`));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(sourceId);
    expect(Array.isArray(res.body.nodes)).toBe(true);
  });

  it('GET /sources/:id → 404 for non-existent source', async () => {
    const res = await auth(request(app).get('/sources/00000000-0000-0000-0000-000000000000'));
    expect(res.status).toBe(404);
  });
});

// ─── Review ───────────────────────────────────────────────────────────────────

describe('Review', () => {
  let pendingNodeId: string;
  let pendingEdgeId: string;

  beforeEach(async () => {
    const node = await createNode({ title: 'Pending Review Node', status: 'PENDING' });
    pendingNodeId = node.id;

    const nodeFrom = await createNode({ title: 'Edge From' });
    const nodeTo = await createNode({ title: 'Edge To' });
    const edge = await createEdge(nodeFrom.id, nodeTo.id, { status: 'PENDING' });
    pendingEdgeId = edge.id;
  });

  afterAll(async () => {
    // Delete edges first to avoid FK violations, then nodes
    await prisma.edge.deleteMany({ where: { userId, status: 'PENDING' } });
    // Also delete committed edges that reference helper nodes created in beforeEach
    await prisma.edge.deleteMany({
      where: { userId, fromNode: { title: { in: ['Edge From', 'Edge To'] } } },
    });
    await prisma.edge.deleteMany({
      where: { userId, toNode: { title: { in: ['Edge From', 'Edge To'] } } },
    });
    await prisma.node.deleteMany({ where: { userId, status: 'PENDING' } });
    await prisma.node.deleteMany({ where: { userId, title: { in: ['Edge From', 'Edge To', 'Pending Review Node'] } } });
  });

  it('GET /review/pending → 200 returns pending nodes and edges', async () => {
    const res = await auth(request(app).get('/review/pending'));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.nodes)).toBe(true);
    expect(Array.isArray(res.body.edges)).toBe(true);

    const nodeIds = res.body.nodes.map((n: any) => n.id);
    expect(nodeIds).toContain(pendingNodeId);
  });

  it('POST /review/commit → 200 commits nodes and edges', async () => {
    const res = await auth(request(app).post('/review/commit'))
      .send({ nodeIds: [pendingNodeId], edgeIds: [pendingEdgeId] });
    expect(res.status).toBe(200);
    expect(res.body.committed.nodes).toBe(1);
    expect(res.body.committed.edges).toBe(1);

    const nodeCheck = await prisma.node.findUnique({ where: { id: pendingNodeId } });
    expect(nodeCheck?.status).toBe('COMMITTED');

    const edgeCheck = await prisma.edge.findUnique({ where: { id: pendingEdgeId } });
    expect(edgeCheck?.status).toBe('COMMITTED');
  });

  it('POST /review/commit → 200 with empty arrays (no-op)', async () => {
    const res = await auth(request(app).post('/review/commit'))
      .send({ nodeIds: [], edgeIds: [] });
    expect(res.status).toBe(200);
    expect(res.body.committed.nodes).toBe(0);
    expect(res.body.committed.edges).toBe(0);
  });

  it('POST /review/reject → 200 archives nodes and edges', async () => {
    const node = await createNode({ title: 'Reject Review Node', status: 'PENDING' });
    const nodeFrom2 = await createNode({ title: 'Edge From 2' });
    const nodeTo2 = await createNode({ title: 'Edge To 2' });
    const edge = await createEdge(nodeFrom2.id, nodeTo2.id, { status: 'PENDING' });

    const res = await auth(request(app).post('/review/reject'))
      .send({ nodeIds: [node.id], edgeIds: [edge.id], nodeReason: 'REJECTED', edgeReason: 'NOT_RELATED' });
    expect(res.status).toBe(200);
    expect(res.body.rejected.nodes).toBe(1);
    expect(res.body.rejected.edges).toBe(1);

    const nodeCheck = await prisma.node.findUnique({ where: { id: node.id } });
    expect(nodeCheck?.status).toBe('ARCHIVED');

    const edgeCheck = await prisma.edge.findUnique({ where: { id: edge.id } });
    expect(edgeCheck?.archived).toBe(true);

    // Cleanup
    await prisma.edgeFeedback.deleteMany({ where: { edgeId: edge.id } });
    await prisma.nodeFeedback.deleteMany({ where: { nodeId: node.id } });
    await prisma.edge.delete({ where: { id: edge.id } });
    await prisma.node.deleteMany({ where: { id: { in: [node.id, nodeFrom2.id, nodeTo2.id] } } });
  });

  it('POST /review/reject → 200 with invalid edgeReason (no feedback created)', async () => {
    const node = await createNode({ title: 'Reject No Reason', status: 'PENDING' });
    const res = await auth(request(app).post('/review/reject'))
      .send({ nodeIds: [node.id], edgeIds: [], edgeReason: 'INVALID_REASON' });
    expect(res.status).toBe(200);

    await prisma.nodeFeedback.deleteMany({ where: { nodeId: node.id } });
    await prisma.node.delete({ where: { id: node.id } });
  });
});

// ─── Agent Sessions ───────────────────────────────────────────────────────────

describe('Agent Sessions', () => {
  it('GET /agent/sessions → 200 returns sessions list', async () => {
    const res = await auth(request(app).get('/agent/sessions'));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /agent/sessions → 401 without token', async () => {
    const res = await request(app).get('/agent/sessions');
    expect(res.status).toBe(401);
  });

  it('POST /agent/query → 200 when graph is empty', async () => {
    // All nodes are already created by tests; just check the empty-graph branch
    // by querying something with a fresh user
    const freshEmail = `fresh-${Date.now()}@test.com`;
    const regRes = await register(freshEmail, 'Password123!');
    const freshToken = regRes.body.token;
    const freshUserId = regRes.body.user.id;

    const res = await request(app)
      .post('/agent/query')
      .set('Authorization', `Bearer ${freshToken}`)
      .send({ question: 'What is machine learning?' });
    expect(res.status).toBe(200);
    expect(res.body.answer).toMatch(/graph is empty/i);

    // Cleanup fresh user
    await prisma.agentSession.deleteMany({ where: { userId: freshUserId } });
    await prisma.user.delete({ where: { id: freshUserId } });
  });

  it('POST /agent/query → 400 when question missing', async () => {
    const res = await auth(request(app).post('/agent/query')).send({});
    expect(res.status).toBe(400);
  });

  it('POST /agent/lint → 200 when not enough nodes (< 3)', async () => {
    const freshEmail = `lint-${Date.now()}@test.com`;
    const regRes = await register(freshEmail, 'Password123!');
    const freshToken = regRes.body.token;
    const freshUserId = regRes.body.user.id;

    const res = await request(app)
      .post('/agent/lint')
      .set('Authorization', `Bearer ${freshToken}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/not enough nodes/i);

    await prisma.agentSession.deleteMany({ where: { userId: freshUserId } });
    await prisma.user.delete({ where: { id: freshUserId } });
  });
});

// ─── Profile ──────────────────────────────────────────────────────────────────

describe('Profile', () => {
  it('GET /profile/corrections → 200 returns corrections (empty by default)', async () => {
    const res = await auth(request(app).get('/profile/corrections'));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rules)).toBe(true);
  });

  it('PATCH /profile/corrections → 200 saves rules', async () => {
    const rules = ['prefer short titles', 'use lowercase tags'];
    const res = await auth(request(app).patch('/profile/corrections'))
      .send({ rules });
    expect(res.status).toBe(200);
    expect(res.body.rules).toEqual(rules);
  });

  it('PATCH /profile/corrections → 400 for invalid rules format', async () => {
    const res = await auth(request(app).patch('/profile/corrections'))
      .send({ rules: 'not an array' });
    expect(res.status).toBe(400);
  });

  it('PATCH /profile/corrections → 400 for non-string rule items', async () => {
    const res = await auth(request(app).patch('/profile/corrections'))
      .send({ rules: [1, 2, 3] });
    expect(res.status).toBe(400);
  });
});

// ─── Auth isolation ───────────────────────────────────────────────────────────

describe('Auth isolation', () => {
  it('cannot access another user\'s node', async () => {
    const otherEmail = `isolation-${Date.now()}@test.com`;
    const regRes = await register(otherEmail, 'Password123!');
    const otherToken = regRes.body.token;
    const otherUserId = regRes.body.user.id;

    const node = await createNode({ title: 'My Private Node' });

    const res = await request(app)
      .get(`/nodes/${node.id}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);

    await prisma.node.delete({ where: { id: node.id } });
    await prisma.user.delete({ where: { id: otherUserId } });
  });

  it('graph endpoint only returns own data', async () => {
    const otherEmail = `isolation2-${Date.now()}@test.com`;
    const regRes = await register(otherEmail, 'Password123!');
    const otherToken = regRes.body.token;
    const otherUserId = regRes.body.user.id;

    const myNode = await createNode({ title: 'My Isolated Node' });

    const res = await request(app)
      .get('/graph')
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    const nodeIds = res.body.nodes.map((n: any) => n.id);
    expect(nodeIds).not.toContain(myNode.id);

    await prisma.node.delete({ where: { id: myNode.id } });
    await prisma.user.delete({ where: { id: otherUserId } });
  });
});
