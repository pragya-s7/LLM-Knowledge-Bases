# MindGraph — Full Architecture & System Documentation

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Repository Structure](#3-repository-structure)
4. [Database Schema](#4-database-schema)
5. [Backend Architecture](#5-backend-architecture)
   - [Entry Point & App Setup](#51-entry-point--app-setup)
   - [Authentication Middleware](#52-authentication-middleware)
   - [Routes](#53-routes)
   - [Library Utilities](#54-library-utilities)
   - [Agents](#55-agents)
   - [Socket Handlers](#56-socket-handlers)
6. [Frontend Architecture](#6-frontend-architecture)
   - [App Shell & Routing](#61-app-shell--routing)
   - [API Layer](#62-api-layer)
   - [Auth Context](#63-auth-context)
   - [Socket Layer](#64-socket-layer)
   - [Type Definitions](#65-type-definitions)
   - [Hooks](#66-hooks)
   - [Components](#67-components)
   - [Views (Pages)](#68-views-pages)
7. [Data Flow Walkthroughs](#7-data-flow-walkthroughs)
   - [Registration & Login](#71-registration--login)
   - [Ingesting a Source](#72-ingesting-a-source)
   - [The Ingest Agent Pipeline](#73-the-ingest-agent-pipeline)
   - [Reviewing Pending Items](#74-reviewing-pending-items)
   - [Querying the Knowledge Graph](#75-querying-the-knowledge-graph)
8. [Key Design Patterns](#8-key-design-patterns)
9. [Configuration & Environment](#9-configuration--environment)
10. [File Reference Table](#10-file-reference-table)

---

## 1. Project Overview

**MindGraph** is a personal AI-powered knowledge graph system. Users ingest sources (web URLs, PDFs, plain text) and an AI agent (Gemma via Ollama) automatically extracts **concept nodes** and **relationship edges** from them. Users review and approve these extractions in a curation queue.

The core loop is:

```
Ingest Source → Agent Extracts Nodes/Edges → User Reviews → Graph Grows
```

Key capabilities:
- Real-time graph building with Socket.IO streaming
- Embedding-based deduplication (prevents duplicate concepts)
- Confidence-based auto-commit (high-confidence items bypass review)
- Domain bucketing (categorizes concepts into subject areas)
- Knowledge querying with citations
- Edge strengthening (re-ingesting related sources increases relationship weight)

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend runtime** | Node.js + TypeScript |
| **Backend framework** | Express.js |
| **ORM** | Prisma |
| **Database** | PostgreSQL + pgvector extension |
| **LLM** | Gemma4 via Ollama (OpenAI-compatible API) |
| **Embeddings** | nomic-embed-text via Ollama |
| **Real-time** | Socket.IO |
| **Auth** | JWT (jsonwebtoken) + bcrypt |
| **HTML parsing** | cheerio |
| **PDF parsing** | pdf-parse |
| **Frontend framework** | React 18 + TypeScript |
| **Build tool** | Vite |
| **Styling** | Tailwind CSS (earth color palette) |
| **Graph visualization** | react-force-graph-2d |
| **Monorepo** | npm workspaces |

---

## 3. Repository Structure

```
LLM-Knowledge-Bases/
├── package.json                  # Root workspace config, dev scripts
├── ARCHITECTURE.md               # This file
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   ├── schema.prisma         # Database schema (all models + enums)
│   │   └── migrations/           # Auto-generated SQL migrations
│   └── src/
│       ├── index.ts              # Entry point: starts HTTP server
│       ├── app.ts                # Express app + Socket.IO setup + route mounting
│       ├── middleware/
│       │   └── auth.ts           # JWT authentication middleware
│       ├── routes/
│       │   ├── auth.ts           # POST /register, POST /login, GET /me
│       │   ├── sources.ts        # POST /ingest, GET /, GET /:id
│       │   ├── nodes.ts          # Node CRUD + feedback endpoints
│       │   ├── edges.ts          # Edge CRUD + feedback
│       │   ├── graph.ts          # GET /graph, GET /graph/delta
│       │   ├── agent.ts          # POST /query, GET /sessions
│       │   └── review.ts         # GET /pending, POST /commit, POST /reject
│       ├── agents/
│       │   ├── ingestAgent.ts    # Full 8-step ingestion pipeline
│       │   ├── prompts.ts        # All LLM system prompt builders
│       │   ├── types.ts          # Agent-specific TypeScript interfaces
│       │   └── schemas.ts        # OpenAI tool/function schema definitions
│       ├── lib/
│       │   ├── prisma.ts         # Singleton PrismaClient
│       │   ├── ingest.ts         # fetchUrl, extractPdfText, hashUrl
│       │   └── embeddings.ts     # getEmbedding, cosineSimilarity
│       └── socket/
│           └── handlers.ts       # Socket.IO auth + room management
└── frontend/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts            # Vite + React plugin + /api proxy
    ├── tailwind.config.js        # Earth color tokens + brand palette
    ├── index.html
    └── src/
        ├── main.tsx              # React root render
        ├── index.css             # Body background + global resets
        ├── App.tsx               # Router, AuthContext, Socket lifecycle
        ├── types/
        │   └── index.ts          # All shared TypeScript types
        ├── lib/
        │   ├── api.ts            # Centralized API client (all endpoints)
        │   ├── auth.ts           # AuthContext + useAuth hook
        │   └── socket.ts         # Socket.IO singleton
        ├── hooks/
        │   └── useSocket.ts      # useSocketEvent hook
        ├── components/
        │   ├── NavBar.tsx         # Top navigation bar
        │   ├── IngestPanel.tsx    # Modal for adding sources
        │   ├── NodeDetailDrawer.tsx # Right-side node info panel
        │   └── ActivityFeedWidget.tsx # Bottom-right toast feed
        └── views/
            ├── LoginPage.tsx      # Auth (login/register toggle)
            ├── GraphPage.tsx      # Main force-directed graph view
            ├── ReviewPage.tsx     # Pending items queue
            └── ActivityFeedPage.tsx # Agent session history (paginated)
```

---

## 4. Database Schema

Defined in `backend/prisma/schema.prisma`. Uses PostgreSQL with the pgvector extension for storing and querying 768-dimensional embeddings.

### Enums

```
NodeStatus:         PENDING | COMMITTED | ARCHIVED
EdgeStatus:         PENDING | COMMITTED | ARCHIVED
EdgeType:           ASSOCIATIVE | CAUSAL | HIERARCHICAL | CONTRADICTS | THEMATIC
AnnotationType:     SUMMARY | INSIGHT | CONTRADICTION | OPEN_QUESTION | SYNTHESIS
NodeFeedbackAction: APPROVED | RENAMED | REJECTED | MERGED
EdgeFeedbackReason: NOT_RELATED | WRONG_TYPE | CONTEXT_SPECIFIC
SourceType:         URL | PDF | TEXT | THOUGHT
SessionTrigger:     INGEST | QUERY
```

### Models

#### `User`
Stores account credentials.
```
id           String (cuid)
email        String (unique)
passwordHash String
createdAt    DateTime
updatedAt    DateTime
```
Relations: nodes, sources, nodeFeedback, edgeFeedback, agentSessions

---

#### `Source`
Represents a raw input document before processing.
```
id            String (cuid)
userId        String → User
type          SourceType (URL|PDF|TEXT|THOUGHT)
url           String? (for URL type)
urlHash       String? (SHA-256 of url, for dedup)
rawContent    String? (extracted text)
intentSignal  String? ("I'm adding this because…")
processedAt   DateTime?
createdAt     DateTime
```
Indexes: `[userId, urlHash]` (dedup), `[userId]`
Relations: nodes (extracted from this source), agentSessions

---

#### `Node`
A knowledge concept (the vertices of the graph).
```
id             String (cuid)
userId         String → User
sourceId       String? → Source
title          String (3-7 words)
content        String (1-3 sentences)
tags           String[]
activityScore  Float (default 0.5, range 0-1)
agentGenerated Boolean (default true)
status         NodeStatus (PENDING by default)
confidence     Float (0-1, from LLM)
embedding      Unsupported (vector(768) via pgvector)
domainBucket   String? (e.g., "machine-learning", "history")
createdAt      DateTime
updatedAt      DateTime
```
Indexes: `[userId, status]`, `[userId, domainBucket]`
Relations: edgesFrom, edgesTo, annotations, feedback, source

---

#### `Edge`
A directional relationship between two nodes.
```
id             String (cuid)
userId         String → User
fromNodeId     String → Node
toNodeId       String → Node
weight         Float (0-1)
type           EdgeType
sourceCitation String? (verbatim quote from source)
confidence     Float (0-1, from LLM)
status         EdgeStatus (PENDING by default)
lastActivated  DateTime
archived       Boolean (default false)
createdAt      DateTime
updatedAt      DateTime
```
Indexes: `[userId, status]`, `[fromNodeId, toNodeId]`
Relations: fromNode, toNode, feedback

---

#### `Annotation`
Agent-generated insights attached to nodes.
```
id             String (cuid)
nodeId         String → Node
agentSessionId String → AgentSession
content        String
type           AnnotationType
createdAt      DateTime
```

---

#### `NodeFeedback`
Logs every user action on a node proposal.
```
id               String (cuid)
userId           String → User
nodeId           String → Node
action           NodeFeedbackAction (APPROVED|RENAMED|REJECTED|MERGED)
newTitle         String? (for RENAMED)
mergedIntoNodeId String? (for MERGED)
createdAt        DateTime
```

---

#### `EdgeFeedback`
Logs every user action on an edge proposal.
```
id        String (cuid)
userId    String → User
edgeId    String → Edge
reason    EdgeFeedbackReason
createdAt DateTime
```

---

#### `AgentSession`
Audit log of every LLM operation.
```
id                String (cuid)
userId            String → User
sourceId          String? → Source (for INGEST triggers)
trigger           SessionTrigger (INGEST | QUERY)
inputTokens       Int (default 0)
outputTokens      Int (default 0)
nodesCreated      Int (default 0)
edgesCreated      Int (default 0)
edgesStrengthened Int (default 0)
nodesRejected     Int (default 0)
merged            Int (default 0)
completedAt       DateTime?
createdAt         DateTime
```

---

## 5. Backend Architecture

### 5.1 Entry Point & App Setup

#### `src/index.ts`
The server entry point. Imports the Express app and HTTP server from `app.ts`, binds to `PORT` (default 3001).

#### `src/app.ts`
Configures the full Express + Socket.IO stack:
- **CORS** — allows `FRONTEND_URL` (default `http://localhost:5173`)
- **Body parsing** — JSON + urlencoded, plus multer for file uploads
- **Socket.IO** — attached to same HTTP server, CORS configured to match
- **Route mounting:**
  ```
  /auth    → auth router
  /graph   → graph router
  /sources → sources router
  /nodes   → nodes router
  /edges   → edges router
  /agent   → agent router
  /review  → review router
  ```
- Calls `initSocketHandlers(io)` to wire up Socket.IO auth and room logic
- Exports `app`, `server`, and `io` (the Socket.IO server instance, passed into agents)

---

### 5.2 Authentication Middleware

#### `src/middleware/auth.ts`

**`requireAuth`** — Express middleware applied to all protected routes.

Flow:
1. Reads `Authorization: Bearer <token>` header
2. Verifies JWT with `JWT_SECRET`
3. Attaches `userId` to `req` (typed as `AuthRequest`)
4. Returns 401 if missing or invalid

All routes except `/auth/register` and `/auth/login` use this middleware.

---

### 5.3 Routes

#### `src/routes/auth.ts` — `/auth`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/register` | Hash password with bcrypt (10 rounds), create User, return JWT |
| POST | `/login` | Find user by email, compare hash, return 30-day JWT |
| GET | `/me` | Return current user's id and email from token |

---

#### `src/routes/sources.ts` — `/sources`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/ingest` | Accept URL/PDF/TEXT, create Source, kick off agent async |
| GET | `/` | List user's sources (paginated, newest first) |
| GET | `/:id` | Source detail + nodes extracted from it |

**`POST /ingest` detail:**

For `type: URL`:
- Compute SHA-256 hash of URL
- Check if source with same `urlHash` already exists for user → 409 if duplicate
- Call `fetchUrl()` → parse HTML with cheerio, extract title + text (max 30k chars)
- Create Source record with `rawContent` set

For `type: PDF`:
- Read uploaded file buffer via multer
- Call `extractPdfText()` → pdf-parse, max 30k chars
- Create Source record

For `type: TEXT`:
- Use raw body text directly

For all types:
- Create Source record, set `processedAt`
- Respond **202** immediately with `{ sourceId }`
- Call `runIngestAgent(sourceId, userId, io)` **without await** (background)

---

#### `src/routes/nodes.ts` — `/nodes`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/:id` | Full node detail: content, tags, annotations, edges in/out with neighbor titles, source URL |
| PATCH | `/:id` | Update title/content/tags/domainBucket |
| DELETE | `/:id` | Archive node (status → ARCHIVED) |
| POST | `/:id/feedback` | Log NodeFeedback, execute action |

**`POST /:id/feedback` actions:**
- `APPROVED` → node.status = COMMITTED, emit `node:created`
- `REJECTED` → node.status = ARCHIVED
- `RENAMED` → update title, node.status = COMMITTED, emit `node:created`
- `MERGED` → update mergedIntoNodeId, archive source node

---

#### `src/routes/edges.ts` — `/edges`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/` | Create edge (user-created, confidence=1.0, auto-COMMITTED) |
| PATCH | `/:id/weight` | Update edge weight, refresh lastActivated |
| POST | `/:id/feedback` | Log EdgeFeedback, archive edge |

---

#### `src/routes/graph.ts` — `/graph`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | All non-ARCHIVED nodes + non-archived COMMITTED edges for user |
| GET | `/delta?since=` | Nodes/edges updated after given ISO timestamp |

The delta endpoint enables the frontend to poll for changes without re-fetching the entire graph.

---

#### `src/routes/agent.ts` — `/agent`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/query` | Answer a question using the knowledge graph |
| GET | `/sessions` | List last 50 agent sessions |

**`POST /query` detail:**
1. Fetch all COMMITTED nodes for user
2. Compute embedding of question
3. Fetch node embeddings via raw SQL (Prisma doesn't support vector natively)
4. Rank by cosine similarity, take top 20
5. Fetch edges for context
6. Build system prompt with `buildQuerySystemPrompt(ctx)`
7. Call LLM (no `response_format` — Gemma wraps JSON in code fences which `parseJson` strips)
8. Parse JSON response: `{ answer, citedNodeIds, contradictions, followUpQuestions, newAnnotations }`
9. Create Annotation records for any `newAnnotations`
10. Log AgentSession with token usage
11. Return result

**`parseJson<T>(text)` helper** (defined in this file):
- Strips markdown code fences (` ```json ... ``` `)
- Finds first `{` and last `}` to isolate JSON object
- Tries `JSON.parse`, falls back to `jsonrepair` for malformed output

---

#### `src/routes/review.ts` — `/review`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/pending` | All PENDING nodes + edges for user |
| POST | `/commit` | Bulk commit: `{ nodeIds[], edgeIds[] }` → COMMITTED, emit sockets |
| POST | `/reject` | Bulk reject: `{ nodeIds[], edgeIds[], feedback? }` → ARCHIVED |

The commit endpoint emits `node:created` and `edge:created` Socket events for each item committed, so the graph view updates live.

---

### 5.4 Library Utilities

#### `src/lib/prisma.ts`
Exports a singleton `PrismaClient`. In development, stores it on `global` to avoid creating new connections on every hot-reload.

---

#### `src/lib/ingest.ts`

**`fetchUrl(url)`**
- node-fetch GET request
- Parse HTML with cheerio
- Remove `<script>`, `<style>`, `<nav>`, `<footer>`, `<header>`, `<aside>` elements
- Extract title from `<title>` tag
- Get body text, collapse whitespace, trim to 30,000 characters
- Returns `{ title, content }`

**`extractPdfText(buffer)`**
- Calls pdf-parse on the buffer
- Returns extracted text trimmed to 30,000 characters

**`hashUrl(url)`**
- SHA-256 hex digest of the URL string (used for deduplication)

---

#### `src/lib/embeddings.ts`

**`getEmbedding(text)`**
- Calls Ollama's `nomic-embed-text` model via OpenAI SDK
- Returns the embedding array (768 dimensions)
- Used for: node embeddings (stored in pgvector), query similarity search, deduplication similarity

**`cosineSimilarity(a, b)`**
- Dot product of two vectors divided by product of their norms
- Returns value between -1 (opposite) and 1 (identical)
- Used to rank nodes by relevance to a query

---

### 5.5 Agents

#### `src/agents/types.ts`
TypeScript interfaces shared across all agent code:

```typescript
interface CandidateNode {
  title: string;
  content: string;
  tags: string[];
  confidence: number;      // 0–1
  domainBucket?: string;
}

interface EdgeProposal {
  fromNodeTitle: string;
  toNodeTitle: string;
  type: 'ASSOCIATIVE' | 'CAUSAL' | 'HIERARCHICAL' | 'CONTRADICTS' | 'THEMATIC';
  sourceCitation: string;  // verbatim quote from source text
  confidence: number;
}

interface AnnotationProposal {
  nodeTitle: string;
  type: 'SUMMARY' | 'INSIGHT' | 'CONTRADICTION' | 'OPEN_QUESTION' | 'SYNTHESIS';
  content: string;
}

interface GraphContext {
  nodes: Array<{ id, title, content, tags, domainBucket, activityScore }>;
  edges: Array<{ id, fromNodeId, toNodeId, type, weight }>;
}

interface ExtractionResult {
  newNodes: CandidateNode[];
  synthesisSummary?: string;
}

interface EdgeResult {
  newEdges: EdgeProposal[];
  strengthenEdgeTitles: string[][];
  annotations: AnnotationProposal[];
}

interface DeduplicationResult {
  decisions: Array<{ newNodeTitle: string; existingNodeTitle: string; decision: 'MERGE' | 'SPECIALIZE' | 'CONTRADICT' | 'DISTINCT' }>;
}
```

---

#### `src/agents/prompts.ts`
All LLM prompts are built here as functions, not hardcoded strings. Each takes context and returns a full system prompt string.

**`buildExtractionSystemPrompt(ctx, intentSignal?)`**
Instructs the LLM to:
- Extract 3–8 distinct concepts from the source
- Each node: 3–7 word title (noun phrase), 1–3 sentence content
- Assign a `domainBucket` (e.g., "machine-learning", "biology")
- Assign `confidence` (0–1)
- Show last 30 existing node titles (for dedup awareness)
- Include `intentSignal` if provided
- Output strict JSON: `{ newNodes: CandidateNode[], synthesisSummary: string }`

**`buildEdgeSystemPrompt(ctx, intentSignal?)`**
Instructs the LLM to:
- Propose edges between nodes (existing + new)
- Each edge MUST include `sourceCitation` — a verbatim quote from the source text
- Confidence penalties for inferred relationships vs. explicit ones
- Flag contradictions with `CONTRADICTS` type, not silence them
- Domain isolation: alert when connecting cross-domain nodes
- List pairs to strengthen (already-existing edges reinforced by this source)
- Output: `{ newEdges: EdgeProposal[], strengthenEdgeTitles: [string,string][], annotations: AnnotationProposal[] }`

**`buildQuerySystemPrompt(ctx)`**
Instructs the LLM to:
- Answer the user's question using only the provided graph context
- Cite every claim by node id
- Surface contradictions between nodes if relevant
- Suggest 2–3 follow-up questions
- Propose new annotations for nodes if insights are found
- Output: `{ answer, citedNodeIds, contradictions, followUpQuestions, newAnnotations }`

---

#### `src/agents/ingestAgent.ts`
The core pipeline. Called as `runIngestAgent(userId, sourceId, sourceContent, intentSignal, io)` — always runs async (no await at call site).

**Constants:**
```typescript
const AUTO_COMMIT_THRESHOLD = 0.75;
const DEDUP_SIMILARITY_THRESHOLD = 0.88;
```

**Step-by-step pipeline:**

**Step 1 — Load Graph Context**
```typescript
async function loadGraphContext(userId)
```
- Fetches all non-ARCHIVED nodes for user (id, title, content, tags, domainBucket, activityScore)
- Fetches all COMMITTED non-archived edges (id, fromNodeId, toNodeId, type, weight)
- Returns `GraphContext`

**Step 2 — Extract Candidate Nodes**
```typescript
async function runExtractionPrompt(sourceContent, ctx, intentSignal?)
```
- Builds system prompt via `buildExtractionSystemPrompt(ctx, intentSignal)`
- Calls Ollama LLM (no `response_format` param — Gemma wraps JSON in code fences)
- Parses response with `parseJson<ExtractionResult>`
- Returns `{ result: ExtractionResult, usage: { prompt_tokens, completion_tokens } }`

**Step 2b — Filter Placeholder Nodes**
After extraction, filters out nodes with placeholder titles (e.g., "Node Title Here") or missing content.

**Step 3 — Deduplicate**
```typescript
async function deduplicateNodes(candidates, graphCtx, userId)
```
For each candidate:
1. Compute embedding with `getEmbedding(title + ' ' + content)`
2. Fetch embeddings of all existing COMMITTED nodes (raw SQL for pgvector)
3. Find any node with cosine similarity > `DEDUP_SIMILARITY_THRESHOLD` (0.88)
4. If found: call LLM to decide `MERGE | SPECIALIZE | CONTRADICT | DISTINCT`
5. `MERGE` → skip this candidate (already covered)
6. Other decisions → keep candidate

Returns `{ kept: CandidateNode[], merged: number, usage }`

**Step 4 — Write Nodes**
```typescript
async function writeNodes(candidates, userId, sourceId, sessionId, io)
```
For each candidate:
1. Validate title and content (skip if missing)
2. Compute embedding
3. `autoCommit = confidence >= 0.75`
4. Create Node in DB with `status: autoCommit ? 'COMMITTED' : 'PENDING'`
5. Store embedding via raw SQL: `UPDATE "Node" SET embedding = '[...]'::vector WHERE id = ?`
6. Emit Socket event: `node:created` (auto-committed) or `node:pending`

Returns `{ nodes, committed, pending }` — counts used in `agent:complete` event.

**Step 5 — Extract Edges**
```typescript
async function runEdgePrompt(sourceContent, edgeCtx, intentSignal?)
```
- Builds edge prompt with ALL nodes (existing + newly created)
- Calls LLM
- Parses: `{ newEdges, strengthenEdgeTitles, annotations }`
- Returns result + token usage

**Step 6 — Write Edges**
```typescript
async function writeEdges(edgeResult, allNodes, userId, sessionId, io)
```
For each edge proposal:
1. Match `fromNodeTitle` and `toNodeTitle` to node IDs in `allNodes`
2. Skip if either node not found
3. `autoCommit = confidence >= 0.75`
4. Create Edge in DB
5. Emit `edge:created` or `edge:pending`

Returns `{ committed, pending }`.

**Step 7 — Write Annotations**
```typescript
async function writeAnnotations(edgeResult, allNodes, sessionId)
```
For each annotation proposal:
- Match `nodeTitle` to node ID
- Create Annotation record in DB

**Step 8 — Strengthen Existing Edges**
```typescript
async function strengthenEdges(pairs, allNodes, userId)
```
For each `[fromTitle, toTitle]` pair in `strengthenEdgeTitles`:
- Match to node IDs
- Find existing edge between them
- Formula: `newWeight = min(1.0, weight + 0.15 * (1 - weight))`
- Update weight + `lastActivated`
- Emit `edge:strengthened` Socket event

**Finalize**
```typescript
async function finalizeSession(sessionId, stats)
```
Updates AgentSession with:
- `inputTokens` (total across all LLM calls)
- `outputTokens`
- `nodesCreated`, `edgesCreated`, `edgesStrengthened`, `merged`
- `completedAt`

**Final Socket Emit — `agent:complete`**
```typescript
io.to(userId).emit('agent:complete', {
  sessionId,
  synthesisSummary,
  nodesCreated,
  nodesCommitted,
  nodesPending,
  edgesCreated,
  edgesCommitted,
  edgesPending,
  merged,
});
```

---

### 5.6 Socket Handlers

#### `src/socket/handlers.ts`

**`initSocketHandlers(io)`**

Socket.IO middleware:
- Reads JWT from `socket.handshake.auth.token`
- Verifies with `JWT_SECRET`, extracts userId
- Attaches `socket.data.userId`
- Rejects unauthenticated connections

On connection:
- User joins room `userId` (all their events are namespaced to this room)
- `io.to(userId).emit(...)` sends only to that user's connections

All emitted events:

| Event | Payload | When |
|-------|---------|------|
| `agent:start` | `{ sessionId, sourceId }` | Ingest begins |
| `agent:thinking` | `{ message }` | Progress updates during pipeline |
| `agent:complete` | `{ nodesCreated, nodesCommitted, nodesPending, edgesCreated, edgesCommitted, edgesPending, merged, synthesisSummary }` | Ingest done |
| `agent:error` | `{ sessionId, message }` | Ingest failed |
| `node:pending` | node object | PENDING node created |
| `node:created` | node object | COMMITTED node created (or approved) |
| `edge:pending` | edge object | PENDING edge created |
| `edge:created` | edge object | COMMITTED edge created (or approved) |
| `edge:strengthened` | `{ id, weight }` | Existing edge weight increased |

---

## 6. Frontend Architecture

### 6.1 App Shell & Routing

#### `src/App.tsx`
The root component. Responsibilities:

1. **AuthContext** — provides `user`, `token`, `login()`, `logout()` to all children
2. **Socket lifecycle** — `connectSocket(token)` on login, `disconnectSocket()` on logout
3. **localStorage** — persists `mg_token` and `mg_user` across sessions
4. **React Router** — routes:
   - `/login` → `<LoginPage />` (redirects to `/` if already logged in)
   - `/` → `<GraphPage />`
   - `/review` → `<ReviewPage />`
   - `/activity` → `<ActivityFeedPage />`

#### `src/main.tsx`
Standard React 18 root render with `<StrictMode>`.

---

### 6.2 API Layer

#### `src/lib/api.ts`
A centralized API client. All requests:
- Prefix path with `/api` (Vite proxies `/api` → `http://localhost:3001`)
- Attach `Authorization: Bearer <token>` header from localStorage
- Parse JSON response
- Throw on non-2xx with error message from body

Namespaced interface:

```typescript
api.auth.register(email, password)
api.auth.login(email, password)
api.auth.me()

api.graph.get()              // all nodes + edges
api.graph.delta(since)       // changes since ISO timestamp

api.sources.ingest(body)     // URL obj or FormData
api.sources.list()
api.sources.get(id)

api.nodes.get(id)            // full detail
api.nodes.update(id, data)
api.nodes.archive(id)
api.nodes.feedback(id, action, extra?)

api.edges.create(data)
api.edges.updateWeight(id, weight)
api.edges.feedback(id, reason)

api.review.pending()
api.review.commit(nodeIds, edgeIds)
api.review.reject(nodeIds, edgeIds, feedback?)

api.agent.query(question)
api.agent.sessions()
```

---

### 6.3 Auth Context

#### `src/lib/auth.ts`

**`AuthContext`** — React context with:
- `user: AuthUser | null` — `{ id, email }`
- `token: string | null`
- `login(user, token)` — stores to localStorage, updates state
- `logout()` — clears localStorage, resets state

**`useAuth()`** — hook to consume AuthContext from any component.

---

### 6.4 Socket Layer

#### `src/lib/socket.ts`
Manages a single shared Socket.IO client instance.

**`getSocket()`** — returns existing socket or creates one pointed at `VITE_BACKEND_URL`

**`connectSocket(token)`**
- Calls `getSocket()`
- Sets `auth.token` on socket
- Calls `socket.connect()`

**`disconnectSocket()`**
- Calls `socket.disconnect()`
- Nullifies the singleton

The socket uses `transports: ['websocket', 'polling']` and auto-reconnects with exponential backoff.

---

### 6.5 Type Definitions

#### `src/types/index.ts`
All TypeScript types used across the frontend:

```typescript
// Enums
NodeStatus, EdgeStatus, EdgeType, AnnotationType
NodeFeedbackAction, EdgeFeedbackReason, SourceType

// Graph data
GraphNode { id, title, content, tags, activityScore, domainBucket, status, confidence, sourceId }
GraphEdge { id, fromNodeId, toNodeId, weight, type, status, confidence }

// Full node detail (from GET /nodes/:id)
NodeDetail {
  ...GraphNode,
  annotations: Annotation[],
  edgesFrom: Array<{ id, weight, toNode: { id, title } }>,
  edgesTo: Array<{ id, weight, fromNode: { id, title } }>,
  source?: { url?: string }
}

// Review queue
PendingNode { id, title, content, tags, confidence, domainBucket, source? }
PendingEdge { id, fromNodeId, toNodeId, type, confidence, sourceCitation,
              fromNode: { title }, toNode: { title } }

// Agent
AgentSession { id, trigger, nodesCreated, edgesCreated, edgesStrengthened,
               nodesRejected, merged, inputTokens, outputTokens,
               completedAt?, createdAt, source? }

QueryResult { answer, citedNodeIds, contradictions, followUpQuestions, newAnnotations }
```

---

### 6.6 Hooks

#### `src/hooks/useSocket.ts`

**`useSocketEvent(eventName, handler)`**
- Calls `getSocket().on(eventName, handler)` on mount
- Calls `getSocket().off(eventName, handler)` on unmount
- Used throughout the app to react to real-time agent events

`SocketEventMap` defines all valid event names and their payload types for type safety.

---

### 6.7 Components

#### `NavBar.tsx`
Rendered at the top of every authenticated page.

Props:
- `onIngest?: () => void` — callback for the Ingest button

Layout: dark brown background (`#6B4530`), white text.
- Logo (GitBranch icon + "MindGraph")
- Nav links: Graph `/`, Review `/review`, Activity `/activity`
- Ingest button (brand color, calls `onIngest`)
- User email + Sign out

---

#### `IngestPanel.tsx`
A floating modal (background is not hazed — just a card over the graph).

Props:
- `onClose()` — close the panel
- `onIngested(sourceId)` — called with returned sourceId after success

Two tabs:
- **URL** — text input for URL, calls `api.sources.ingest({ type: 'URL', url, intentSignal })`
- **File** — drag-or-click file upload (PDF/TXT), sends as `FormData`

Both include an optional **intent signal** field ("I'm adding this because…").

---

#### `NodeDetailDrawer.tsx`
A right-side drawer that slides in when a node is clicked on the graph.

Props:
- `nodeId: string`
- `onClose()`
- `onNavigateToNode(id)` — called when user clicks a connected node

Fetches `api.nodes.get(nodeId)` on mount (re-fetches if `nodeId` changes).

Sections:
1. **Content** — full content text + tags + domainBucket badge
2. **Meta** — confidence % + status (COMMITTED/PENDING)
3. **Agent Notes** — annotations color-coded by type:
   - SUMMARY → tan
   - INSIGHT → brand tint
   - CONTRADICTION → red
   - OPEN_QUESTION → yellow
   - SYNTHESIS → brand stronger tint
4. **Connections** — edges in/out, each showing weight and linked node title (clickable)
5. **Source** — URL link if available

---

#### `ActivityFeedWidget.tsx`
Bottom-right live toast feed. Appears only when there are entries.

Listens to:
- `agent:start` → "Agent started processing…"
- `agent:complete` → "Done — N nodes, M edges added" + "(X need review)" only if `nodesPending + edgesPending > 0`
- `agent:error` → "Ingest failed: [message]"

Shows last 4 entries (keeps up to 10 in state). Color-coded:
- `error` → red bg
- `complete` → brand tint bg
- `start` → earth card bg

---

### 6.8 Views (Pages)

#### `LoginPage.tsx`
Toggle between login and register forms. On success: stores token + user in localStorage, connects socket, redirects to `/`.

---

#### `GraphPage.tsx`
The main application view. Renders the force-directed knowledge graph.

**State:**
- `nodes` and `edges` (full graph data)
- `selectedNodeId` (open drawer)
- `showIngest` (IngestPanel visibility)
- `pendingCount` (number of pending items for nav)

**Graph rendering** via `react-force-graph-2d`:
- Canvas background: `#FAF7F0` (earth light)
- Node color: interpolated between forest green (`#2D5016`) at high activityScore and terracotta (`#8B4513`) at low activityScore
- PENDING nodes: dashed circle outline
- Edge color: `#7A5840` (warm brown)
- Edge width: proportional to weight
- Node label: title text (`#1C0F00`)
- Click node → opens `NodeDetailDrawer`

**Data loading:**
- Initial: `api.graph.get()` → sets all nodes and edges
- Delta polling every 5 seconds: `api.graph.delta(since)` → merges changes

**Socket events handled:**
- `node:pending` → add node to graph with PENDING status (dashed outline)
- `node:created` → add or update node to COMMITTED (solid)
- `edge:pending` → add edge to graph with PENDING status
- `edge:created` → add or update edge to COMMITTED
- `edge:strengthened` → update edge weight in graph

**Child components:**
- `<NavBar onIngest={...} />`
- `<IngestPanel />` (conditional)
- `<NodeDetailDrawer />` (conditional on selectedNodeId)
- `<ActivityFeedWidget />` (bottom-right overlay)

---

#### `ReviewPage.tsx`
The curation queue. Lists all PENDING nodes and edges for user approval.

**Proposed Nodes:**
- Each card: title, content preview, tags, confidence badge, domain bucket
- Actions:
  - **Good** → `api.nodes.feedback(id, 'APPROVED')`
  - **Rename** → inline text input → `api.nodes.feedback(id, 'RENAMED', { newTitle })`
  - **Wrong** → `api.nodes.feedback(id, 'REJECTED')`
- Confidence badge color: green ≥0.8, yellow ≥0.6, red <0.6
- Bulk: "Approve all >85%" and "Reject all <50%"

**Proposed Edges:**
- Each card: from node → edge type → to node, confidence, source citation
- Actions: Approve, Not related, Wrong type, Context only
- Edge type color coding: CAUSAL=amber, HIERARCHICAL=emerald, CONTRADICTS=red, THEMATIC=purple, ASSOCIATIVE=default

**Empty state:** Blank (no message when queue is empty).

---

#### `ActivityFeedPage.tsx`
History of all agent sessions.

**Pagination:** 10 per page, Previous/Next buttons with "page / total" indicator (only shown when >10 sessions).

Each session card:
- Trigger badge (INGEST=brand color, QUERY=muted)
- Source URL link (for INGEST sessions)
- Stats: nodes created, edges created, edges strengthened, nodes rejected (only non-zero shown)
- Token count (if completed)
- "In progress…" indicator (if not yet completed)
- Timestamp (date + time)

Auto-refreshes every 4 seconds.

---

## 7. Data Flow Walkthroughs

### 7.1 Registration & Login

```
User fills email+password → LoginPage form submit
  → api.auth.register(email, password)
  → POST /auth/register
  → bcrypt hash password (10 rounds)
  → prisma.user.create()
  → sign JWT (30 day expiry)
  → return { token, user }
  → auth.login(user, token) in App.tsx
  → localStorage.setItem('mg_token', token)
  → connectSocket(token) → Socket.IO handshake with JWT
  → navigate to '/'
```

---

### 7.2 Ingesting a Source

```
User clicks "Ingest" button in NavBar
  → GraphPage calls setShowIngest(true)
  → IngestPanel renders as floating modal

User pastes URL + optional intent signal → submits

IngestPanel:
  → api.sources.ingest({ type: 'URL', url, intentSignal })
  → POST /sources/ingest (JSON or multipart)

Backend /sources route:
  → hashUrl(url) → check for existing source with same hash
  → if duplicate: return 409
  → fetchUrl(url):
      → node-fetch GET
      → cheerio: strip nav/footer/scripts
      → extract title + body text (max 30k chars)
  → prisma.source.create({ userId, type, url, urlHash, rawContent, intentSignal })
  → return 202 { sourceId }

IngestPanel:
  → receives sourceId → calls onIngested(sourceId) → closes panel

Backend (async, no await):
  → runIngestAgent(userId, sourceId, sourceContent, intentSignal, io)
```

---

### 7.3 The Ingest Agent Pipeline

This runs fully async after the 202 response.

```
runIngestAgent(userId, sourceId, sourceContent, intentSignal, io):

  io.emit('agent:start', { sessionId, sourceId })

  [Step 1] loadGraphContext(userId)
    → prisma: fetch all non-ARCHIVED nodes (id, title, content, tags, domainBucket, activityScore)
    → prisma: fetch all COMMITTED non-archived edges
    → returns GraphContext { nodes, edges }

  io.emit('agent:thinking', { message: 'Extracting concepts…' })

  [Step 2] runExtractionPrompt(sourceContent, graphCtx, intentSignal)
    → buildExtractionSystemPrompt(ctx):
        Shows: last 30 node titles + domain buckets, intent signal
        Asks for: 3-8 CandidateNodes with title/content/tags/confidence/domainBucket
    → LLM call (Gemma via Ollama)
    → parseJson: strip code fences, JSON.parse (or jsonrepair fallback)
    → returns { result: { newNodes, synthesisSummary }, usage }

  Filter: remove placeholder/empty nodes

  [Step 3] deduplicateNodes(candidates, graphCtx, userId)
    For each candidate:
      → getEmbedding(title + ' ' + content) → 768-dim vector
      → raw SQL: SELECT id, embedding FROM Node WHERE userId AND status = COMMITTED
      → cosineSimilarity(candidateEmbedding, existingEmbedding) for each
      → if similarity > 0.88:
          → LLM call: MERGE|SPECIALIZE|CONTRADICT|DISTINCT?
          → MERGE → skip this candidate
          → else → keep
    → returns { kept, merged, usage }

  [Step 4] writeNodes(kept, userId, sourceId, sessionId, io)
    For each candidate:
      → validate title + content
      → getEmbedding(title + ' ' + content)
      → autoCommit = confidence >= 0.75
      → prisma.node.create({ status: autoCommit ? COMMITTED : PENDING })
      → raw SQL: UPDATE Node SET embedding = '[...]'::vector WHERE id = ?
      → if autoCommit: io.emit('node:created', nodeData)
      → else:          io.emit('node:pending', nodeData)
    → returns { nodes, committed, pending }

  io.emit('agent:thinking', { message: 'Drawing edges…' })

  [Step 5] runEdgePrompt(sourceContent, edgeCtx, intentSignal)
    → edgeCtx.nodes = existing nodes + newly created nodes
    → buildEdgeSystemPrompt(ctx):
        Shows: all node titles by domain
        Asks for: EdgeProposals (with verbatim sourceCitation), strengthenEdgeTitles, annotations
    → LLM call → parseJson
    → returns { newEdges, strengthenEdgeTitles, annotations, usage }

  [Step 6] writeEdges(edgeResult, allNodes, userId, sessionId, io)
    For each EdgeProposal:
      → match fromNodeTitle → fromNodeId
      → match toNodeTitle → toNodeId
      → skip if either not found
      → autoCommit = confidence >= 0.75
      → prisma.edge.create({ status: autoCommit ? COMMITTED : PENDING })
      → if autoCommit: io.emit('edge:created', edgeData)
      → else:          io.emit('edge:pending', edgeData)
    → returns { committed, pending }

  [Step 7] writeAnnotations(edgeResult, allNodes, sessionId)
    → match annotation.nodeTitle → nodeId
    → prisma.annotation.createMany(...)

  [Step 8] strengthenEdges(strengthenEdgeTitles, allNodes, userId)
    For each [fromTitle, toTitle]:
      → find existing edge between them
      → newWeight = min(1.0, weight + 0.15 * (1 - weight))
      → prisma.edge.update({ weight: newWeight, lastActivated: now })
      → io.emit('edge:strengthened', { id, weight: newWeight })

  finalizeSession(sessionId, stats)
    → prisma.agentSession.update({ inputTokens, outputTokens, nodesCreated, ... completedAt })

  io.emit('agent:complete', {
    nodesCreated, nodesCommitted, nodesPending,
    edgesCreated, edgesCommitted, edgesPending,
    merged, synthesisSummary
  })
```

**Frontend during this entire process:**

```
GraphPage + ActivityFeedWidget (via useSocketEvent):

  agent:start       → ActivityFeedWidget: "Agent started processing…"
  node:pending      → GraphPage: add node with PENDING status → dashed circle on graph
  node:created      → GraphPage: add/update node to COMMITTED → solid circle on graph
  edge:pending      → GraphPage: add edge with PENDING status
  edge:created      → GraphPage: add/update edge to COMMITTED
  edge:strengthened → GraphPage: update edge weight → line thickness changes
  agent:complete    → ActivityFeedWidget: "Done — 5 nodes, 4 edges added (2 need review)"
                      (the "(X need review)" note only appears if nodesPending + edgesPending > 0)
```

---

### 7.4 Reviewing Pending Items

```
User navigates to /review
  → ReviewPage mounts
  → api.review.pending()
  → GET /review/pending
  → prisma: nodes WHERE userId AND status = PENDING
  → prisma: edges WHERE userId AND status = PENDING
  → return { nodes, edges }

User clicks "Good" on a node:
  → api.nodes.feedback(nodeId, 'APPROVED')
  → POST /nodes/:id/feedback { action: 'APPROVED' }
  → prisma.nodeFeedback.create({ userId, nodeId, action: APPROVED })
  → prisma.node.update({ status: COMMITTED })
  → io.to(userId).emit('node:created', nodeData)
  → ReviewPage removes node from local list
  → GraphPage receives 'node:created' → updates node status in graph

User clicks "Rename":
  → Inline input appears → user types new title → confirms
  → api.nodes.feedback(nodeId, 'RENAMED', { newTitle })
  → prisma.node.update({ title: newTitle, status: COMMITTED })
  → io.emit('node:created', { ...nodeData, title: newTitle })

User clicks "Wrong":
  → api.nodes.feedback(nodeId, 'REJECTED')
  → prisma.node.update({ status: ARCHIVED })
  → Node disappears from review + graph

Bulk "Approve all >85%":
  → filter nodes where confidence >= 0.85
  → api.review.commit(nodeIds, [])
  → POST /review/commit { nodeIds, edgeIds: [] }
  → COMMITTED for each, io.emit('node:created', ...) for each
```

---

### 7.5 Querying the Knowledge Graph

```
api.agent.query("How does attention mechanism work?")
  → POST /agent/query { question }

Backend:
  → prisma: fetch all COMMITTED nodes for user
  → if none: return "Your graph is empty"
  → getEmbedding(question) → 768-dim vector
  → raw SQL: SELECT id, embedding::text FROM Node WHERE userId AND status = COMMITTED
  → cosineSimilarity(questionEmbedding, nodeEmbedding) for each → sort desc → top 20
  → fetch edges for context
  → buildQuerySystemPrompt({ topNodes, edges })
  → LLM call
  → parseJson: { answer, citedNodeIds, contradictions, followUpQuestions, newAnnotations }
  → prisma.annotation.create(...) for each newAnnotation
  → prisma.agentSession.update({ inputTokens, outputTokens, completedAt })
  → return result
```

---

## 8. Key Design Patterns

### Async Ingest with Real-Time Streaming
The HTTP response returns immediately (202) after creating the Source record. The agent pipeline runs in the background and streams progress via Socket.IO. The user is never blocked waiting for LLM responses — they see the graph update live as nodes and edges are created.

### Confidence-Based Auto-Commit
Rather than forcing every item through a review queue, the system uses confidence as a proxy for certainty:
- `confidence >= 0.75` → auto-COMMITTED (appears on graph immediately, no review needed)
- `confidence < 0.75` → PENDING (goes to review queue)

Users see the higher-confidence items immediately in their graph, while reviewing only the uncertain ones.

### Embedding-Based Deduplication
Before writing any new node, the agent computes its embedding and compares against all existing committed nodes. If similarity exceeds 0.88 (nearly identical concept), the LLM makes a final decision:
- **MERGE** — already covered by an existing node (skip)
- **SPECIALIZE** — different enough to keep as a sub-concept
- **CONTRADICT** — same topic but opposing view (keep, flagged)
- **DISTINCT** — genuinely different concept (keep)

This prevents the graph from filling with near-duplicate nodes across sources.

### Source Citation Requirement
Every edge MUST include a `sourceCitation` — a verbatim quote from the source text that justifies the relationship. This:
- Grounds edges in evidence (no hallucinated connections)
- Lets users verify the relationship by reading the original quote
- Makes the graph auditable and trustworthy

### Domain Bucketing
Each node is assigned a `domainBucket` by the agent (e.g., "machine-learning", "history", "biology"). The edge prompt warns the agent when drawing cross-domain edges — unusual cross-domain connections receive confidence penalties.

### Edge Strengthening
When a new source reinforces an existing relationship between two nodes, the agent includes that pair in `strengthenEdgeTitles`. The backend applies `newWeight = min(1.0, weight + 0.15 * (1 - weight))` and resets `lastActivated`. This reflects the growing evidence for a connection.

### JSON Parsing Robustness
Gemma (and other models via Ollama) often wraps JSON in markdown code fences or produces slightly malformed JSON. The `parseJson` function handles this with three layers:
1. Strip ` ```json ... ``` ` code fences
2. Find first `{` and last `}` (ignore any surrounding text)
3. Try `JSON.parse` → fall back to `jsonrepair` library for fixable issues

Note: `response_format: { type: 'json_object' }` was intentionally **not used** because Gemma through Ollama's compatibility layer returns empty content when this parameter is set.

---

## 9. Configuration & Environment

### Environment Variables

```bash
# Backend (.env in /backend or root)
DATABASE_URL=postgresql://user:pass@localhost:5432/mindgraph
JWT_SECRET=your-secret-key
OLLAMA_BASE_URL=http://localhost:11434/v1   # default
OLLAMA_MODEL=gemma4                          # default
FRONTEND_URL=http://localhost:5173           # for CORS
PORT=3001                                    # default

# Frontend (.env in /frontend)
VITE_BACKEND_URL=http://localhost:3001
```

### Ollama Setup
Two models are required:
```bash
ollama pull nomic-embed-text   # for embeddings (768-dim)
ollama pull gemma4             # (or whichever OLLAMA_MODEL specifies) for all LLM calls
```

### Database Setup
```bash
cd backend
npx prisma db push      # sync schema to DB (or npx prisma migrate dev for migrations)
npx prisma generate     # generate Prisma client
```

### Development
```bash
# From repo root
npm install
npm run dev        # starts backend (port 3001) + frontend (port 5173) concurrently

# Or separately:
npm run dev:backend
npm run dev:frontend
```

### Vite Proxy
`frontend/vite.config.ts` proxies `/api/*` → `http://localhost:3001/*`, so all frontend API calls use `/api/...` without needing to hardcode the backend URL.

### Tailwind Earth Palette
`frontend/tailwind.config.js` defines the full color system:
```javascript
earth: {
  bg:     '#FAF7F0',  // page background (warm off-white)
  card:   '#F0E5D0',  // card backgrounds
  input:  '#E3D0B8',  // input fields
  border: '#C8A882',  // borders
  text:   '#1C0F00',  // primary text (near-black warm)
  body:   '#3A2010',  // body text
  muted:  '#6B4530',  // muted text / nav background
  faint:  '#9A7A5A',  // placeholder text
},
brand: {
  50:  '#FDF0E8',
  500: '#8B4513',  // primary brand (saddle brown / terracotta)
  600: '#6B3410',
  700: '#4F260C',
}
```

Note: arbitrary hex values (e.g., `bg-[#6B4530]`) are used in some components because Tailwind JIT doesn't always generate classes from config tokens if the token isn't referenced elsewhere in the scan path.

---

## 10. File Reference Table

| File | Role | Key Exports / Responsibilities |
|------|------|-------------------------------|
| **Backend** | | |
| `src/index.ts` | Server entry point | Starts HTTP server on PORT |
| `src/app.ts` | App config | Express, Socket.IO, CORS, route mounting |
| `src/middleware/auth.ts` | JWT auth | `requireAuth`, `AuthRequest` |
| `src/lib/prisma.ts` | DB singleton | `prisma` (PrismaClient) |
| `src/lib/ingest.ts` | Text extraction | `fetchUrl()`, `extractPdfText()`, `hashUrl()` |
| `src/lib/embeddings.ts` | Vector ops | `getEmbedding()`, `cosineSimilarity()` |
| `src/routes/auth.ts` | Auth endpoints | `/register`, `/login`, `/me` |
| `src/routes/sources.ts` | Source ingestion | `/ingest`, list, detail |
| `src/routes/nodes.ts` | Node management | CRUD, `/feedback` |
| `src/routes/edges.ts` | Edge management | CRUD, `/feedback` |
| `src/routes/graph.ts` | Graph queries | `/` (all), `/delta` (changes since timestamp) |
| `src/routes/agent.ts` | LLM operations | `/query`, `/sessions` |
| `src/routes/review.ts` | Curation queue | `/pending`, `/commit`, `/reject` |
| `src/agents/ingestAgent.ts` | 8-step pipeline | `runIngestAgent()` |
| `src/agents/prompts.ts` | LLM prompts | `buildExtractionSystemPrompt()`, `buildEdgeSystemPrompt()`, `buildQuerySystemPrompt()` |
| `src/agents/types.ts` | Agent interfaces | `CandidateNode`, `EdgeProposal`, `GraphContext`, etc. |
| `src/agents/schemas.ts` | OpenAI tool schemas | Function call definitions (reference only) |
| `src/socket/handlers.ts` | Socket.IO setup | `initSocketHandlers()`, JWT auth, room management |
| `prisma/schema.prisma` | Data model | 8 models + enums |
| **Frontend** | | |
| `src/main.tsx` | React root | Mounts `<App />` |
| `src/App.tsx` | App shell | Router, AuthContext, Socket lifecycle |
| `src/lib/api.ts` | API client | All endpoint wrappers under `api.*` |
| `src/lib/auth.ts` | Auth context | `AuthContext`, `useAuth()` |
| `src/lib/socket.ts` | Socket singleton | `connectSocket()`, `disconnectSocket()`, `getSocket()` |
| `src/hooks/useSocket.ts` | Socket hook | `useSocketEvent(event, handler)` |
| `src/types/index.ts` | Type definitions | `GraphNode`, `GraphEdge`, `NodeDetail`, `AgentSession`, etc. |
| `src/components/NavBar.tsx` | Top navigation | Ingest button, page links, user info |
| `src/components/IngestPanel.tsx` | Add source modal | URL + file upload, intent signal |
| `src/components/NodeDetailDrawer.tsx` | Node info sidebar | Content, annotations, connections, source |
| `src/components/ActivityFeedWidget.tsx` | Live toast feed | agent:start/complete/error events |
| `src/views/LoginPage.tsx` | Auth page | Login + register toggle |
| `src/views/GraphPage.tsx` | Main graph view | Force-directed graph, real-time Socket updates |
| `src/views/ReviewPage.tsx` | Curation queue | Approve/rename/reject pending items |
| `src/views/ActivityFeedPage.tsx` | Session history | Paginated agent session log (10/page) |
| `tailwind.config.js` | Styling | Earth + brand color tokens |
| `vite.config.ts` | Build config | React plugin, `/api` proxy |
