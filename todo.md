# MindGraph — Implementation TODO

## Backend ✅ Done
- [x] Monorepo structure (root package.json with workspaces)
- [x] Backend package.json + tsconfig.json
- [x] Prisma schema — all models with pgvector, correct relations, HealthReport added
- [x] Express server (index.ts) with Socket.io
- [x] Auth middleware (JWT)
- [x] Auth routes (register, login, /me)
- [x] Graph routes (GET /graph, GET /graph/delta)
- [x] Sources routes (POST /ingest with URL/PDF/TEXT/THOUGHT, dedup, GET list/detail)
- [x] Nodes routes (GET, PATCH, DELETE, POST feedback)
- [x] Edges routes (POST, PATCH weight, POST feedback, POST decay)
- [x] Review routes (GET pending, POST commit, POST reject)
- [x] Agent routes (POST query, POST lint, POST correction-synthesis, GET sessions)
- [x] Profile routes (GET/PATCH corrections)
- [x] Socket.io handlers (auth middleware, userId rooms)
- [x] Agent types + structured output schemas (Anthropic tool_use)
- [x] Agent prompts (extraction, edge, query, lint, correction synthesis)
- [x] Ingest agent loop (extraction → dedup → write nodes → edges → annotations → strengthen)
- [x] Embeddings lib (text-embedding-3-small + cosine similarity)
- [x] Ingest lib (URL fetch+parse with cheerio, PDF extraction, URL hash dedup)
- [x] Cron jobs (Hebbian decay daily, correction synthesis weekly, auto-commit 48h)
- [x] .env.example

## Frontend ✅ Done
- [x] Scaffold frontend (package.json, tsconfig, vite.config, index.html, tailwind)
- [x] TypeScript types (GraphNode, GraphEdge, NodeDetail, PendingNode/Edge, etc.)
- [x] API client lib (typed fetch wrapper for all endpoints)
- [x] Socket.io client lib + useSocketEvent hook
- [x] Auth context (AuthContext, useAuth)
- [x] App.tsx with routing + auth-gated routes
- [x] Login/register page
- [x] Graph canvas view (react-force-graph-2d, pending/committed visual states, live socket updates)
- [x] NavBar with pending count badge
- [x] Ingest panel modal (URL / PDF / Thought tabs + intent field)
- [x] Review queue page (per-node feedback: approve/rename/reject, per-edge rejection with 3 reasons, bulk actions)
- [x] Node detail drawer (annotations, connected edges, "Develop This Idea" via query agent)
- [x] Activity feed widget (bottom-right overlay on graph canvas)
- [x] Activity feed page (full session log with token counts)
- [x] Correction profile page (view/edit rules, manual re-synthesis)
- [x] Graph health report page (run lint, display contradictions/orphans/gaps/dupes/suggestions)

## Still Needed ⬜
- [ ] `npm install` in backend/ and frontend/ (you need to run this)
- [ ] Create `.env` file in backend/ (copy from .env.example, fill in keys)
- [ ] `npx prisma migrate dev --name init` in backend/ (needs Postgres running with pgvector)
- [ ] End-to-end smoke test: ingest a URL, check nodes/edges appear in graph
- [ ] Fix: `edges/decay` route imports `runDecay` from cron — verify export works after install
- [ ] Fix: `agent/lint` route maps HealthReport JSON fields — verify column names match Prisma model
- [ ] "Develop This Idea" agent — currently uses the query agent; could be a dedicated prompt for better gap analysis + source suggestions (post-milestone improvement)
- [ ] Frontend `.env` or `vite.config` — set `VITE_BACKEND_URL` if deploying (defaults to localhost:3001)

## Deployment ⬜
- [ ] Railway setup (PostgreSQL + backend service, enable pgvector extension with `CREATE EXTENSION vector`)
- [ ] Vercel setup (frontend)
- [ ] Set env vars on Railway + Vercel
- [ ] Verify CORS origin matches Vercel URL

## Pre-Demo Checklist ⬜
- [ ] Test 3+ URLs ingested end-to-end
- [ ] Review queue: approve/reject nodes + edges, verify feedback stored
- [ ] Two related sources → shared nodes + strengthened edges
- [ ] Agent query returns answer citing node IDs
- [ ] Correction profile generated from feedback
- [ ] Health lint pass with results shown
- [ ] Real-time: ingest on one machine appears on another




# 1. Install deps
  cd backend && npm install
  cd ../frontend && npm install

  # 2. Create backend/.env (copy from .env.example, add your keys)
  cp backend/.env.example backend/.env

  # 3. Start a local Postgres with pgvector, then:
  cd backend
  npx prisma migrate dev --name init

  # 4. Run both servers
  npm run dev  # from root (runs both concurrently)

  One known thing to verify after install: the edges/decay route and the pgvector raw query syntax in ingestAgent.ts — the ::vector cast needs pgvector enabled on the DB. On Railway you enable it with CREATE
  EXTENSION vector before the first migration.