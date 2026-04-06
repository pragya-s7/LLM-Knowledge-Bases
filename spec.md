# MindGraph — Full Product Specification

> An Agentic Knowledge OS that thinks back

**Pragya & Darsh · CIS 1962 · Spring 2026**
Milestone: April 16 · Demo: April 23

---

## Table of Contents

1. [Vision](#1-vision)
2. [Core Concepts](#2-core-concepts)
3. [Tech Stack](#3-tech-stack)
4. [Data Model](#4-data-model-prisma-schema)
5. [Agent Prompt Architecture](#5-agent-prompt-architecture)
6. [API Routes](#6-api-routes)
7. [Frontend Views](#7-frontend-views)
8. [Real-Time Architecture](#8-real-time-architecture-socketio)
9. [Revised Milestones](#9-revised-milestones)
10. [Labor Split](#10-recommended-labor-split)
11. [Open Questions](#11-open-questions--decisions-needed)
12. [Appendix](#appendix-inspiration--references)

---

## 1. Vision

MindGraph is a living knowledge OS — a second brain that doesn't just store what you know, but actively builds, connects, and develops it over time.

Most knowledge tools are passive. You write notes; they sit there. Retrieval-augmented systems are better, but they re-derive knowledge from scratch on every query — nothing accumulates. MindGraph is different in two ways:

- **The graph is built by Claude, not by you.** You feed it raw sources — URLs, PDFs, pasted text, quick thoughts. Claude reads them, extracts concepts, creates nodes and edges, and integrates each new source into the existing graph. You never manually create a node. You explore what Claude builds.

- **The graph learns over time** — both through Hebbian co-activation and through your corrections. Edge weights between nodes strengthen through co-activation. Critically, Claude's understanding of your intentions sharpens session-by-session as it observes which nodes you reject, which edges you dispute, and what domain boundaries matter to you. The graph becomes a map of how your ideas actually relate, not just what Claude guessed.

The user experience is simple: drop in a source, optionally state why you're adding it, watch Claude build the graph in real time, then review what it made. Correct what's wrong. Ask questions. Feed it more. Over weeks, it becomes a genuine knowledge asset — shaped by your actual thinking, not an LLM's default assumptions about what connects to what.

---

## 2. Core Concepts

### 2.1 The Knowledge Graph

The graph is the persistent artifact at the heart of the product. Every piece of knowledge lives as a node; every relationship between pieces of knowledge is an edge with a weight. Claude owns the graph — it creates nodes, draws edges, and writes annotations. Users browse it and correct it.

- **Nodes** represent atomic concepts, entities, claims, or ideas extracted from sources.
- **Edges** represent relationships between nodes: causal, associative, contradictory, hierarchical, or thematic.
- **Edge weights** reflect connection strength. Weights increase when nodes are co-activated and decay on inactivity.
- **Annotations** are Claude-written insights attached to nodes: summaries, open questions, contradictions flagged, connections to other parts of the graph.
- **Pending nodes/edges** are proposals awaiting user review. Shown in a distinct visual state before being committed to the graph.

---

### 2.2 The Ingest Pipeline

Ingestion is the primary user action. The user drops in a source and optionally states their intent; Claude does the rest.

- **URL ingestion:** Claude fetches the article, strips boilerplate, extracts the full text, and processes it through the agent loop.
- **File ingestion:** PDFs and plain text files are uploaded; text is extracted and sent to the agent.
- **Quick thoughts:** a short text input that becomes a seed node immediately, with Claude expanding and connecting it to the graph.
- **Per-source intent signal:** an optional one-line field ("I'm adding this because…") passed as a directive in the agent prompt, scoping which connections Claude should prioritize.

A single source may touch 10–20 nodes. Claude reads the full graph state before processing a new source, so every ingest is aware of everything already in the graph. This is what makes knowledge compound rather than accumulate as isolated entries.

---

### 2.3 The Agent Loop

The agent loop is the engine of the product. It runs on every ingest and on-demand queries.

1. Claude receives the full graph state as structured JSON context: all nodes (id, title, content, tags), all edges (source, target, weight, type, last_activated), existing annotations, and the user's current correction profile.
2. Claude receives the new source content and any per-source intent signal.
3. Claude reasons through proposed changes in a scratchpad (chain-of-thought) before emitting structured output. The scratchpad is shown as a "Thinking…" animation in the ingest panel.
4. Claude returns a structured response (via Anthropic structured outputs) with: new nodes to create, new edges to draw (each with a required source citation), existing edges to strengthen, annotations to attach, and a synthesis note.
5. All proposed nodes and edges are written as **pending** records. High-confidence items (>0.85) auto-commit; low-confidence items enter the review queue.
6. The backend parses the response, writes updates to PostgreSQL via Prisma, and emits graph delta events via Socket.io.
7. The frontend receives the delta and re-renders the graph live.

---

### 2.4 Hebbian Learning

Edge weights evolve through a simplified Hebbian model: connections that fire together, wire together.

- **Co-activation update:** when two nodes are both referenced in the same agent session, their shared edge weight and individual activity scores increase.
  - Formula: `w_new = w_old + α × (1 − w_old)` where `α = 0.15`
- **Decay:** a background job runs every 24 hours. Edges inactive for more than 7 days lose weight.
  - Formula: `w_new = w_old × (1 − δ)` where `δ = 0.05` per day of inactivity
- **Floor and ceiling:** weights are clamped to `[0.05, 1.0]`. Edges at the floor (<0.1) after 30 days are archived, not deleted.
- **Visual encoding:** edge thickness scales linearly with weight. Users see the graph changing shape as they use it over time.

---

### 2.5 Intention Learning *(new)*

This is the system that makes MindGraph understand your intentions without requiring an upfront profile. Rather than asking who you are, MindGraph watches what you correct and builds precision from your behavior.

#### Micro-feedback on Nodes

After each ingest, the user can rate each new node with one of four actions:

| Action | Meaning |
|--------|---------|
| ✓ Good | Commit as-is |
| ~ Rename | Concept is right, title is wrong |
| ✗ Wrong concept | Reject and archive |
| ⇌ Merge with [node] | Duplicate of an existing node |

Feedback is stored in a `NodeFeedback` table and aggregated into per-user patterns: which concept types get rejected, which domains Claude over-extracts from, which granularity the user prefers.

#### Edge Rejection with Reason

Users can reject any edge with a reason:

- **"These aren't actually related"** — hallucinated connection
- **"Related, but not how you drew it"** — wrong edge type
- **"Related in a different context"** — domain-specific, not general

Each rejection trains a local rule stored in `EdgeFeedback`. These accumulate silently and get prepended to the system prompt as instructions Claude follows automatically.

#### Mandatory Edge Citations

Claude is required to cite a specific passage from the source for every edge it draws. Inferential connections — those Claude makes without a direct textual basis — are automatically flagged as low-confidence and rendered differently in the graph. This single constraint cuts spurious cross-domain connections dramatically.

#### Domain Isolation by Default

The graph infers domain buckets from your first few ingests. Edges between different domain buckets require a higher evidence threshold — Claude must cite a source that explicitly bridges them, not just imply a connection. Users can lower the threshold for specific bucket pairs. Cross-domain connections become notable when they appear, rather than noise.

#### Per-Ingest Intent Signal

When submitting a source, an optional one-line field scopes Claude's behavior for that ingest:

- *"I'm adding this because I want to understand how attention mechanisms work"* → Claude focuses on mechanistic nodes
- *"I'm adding this because it came up in an argument I want to resolve"* → Claude flags contradictions with existing nodes
- *"I just found it interesting"* → Claude stays close to the source, minimal inference

No entry means Claude uses its best judgment plus correction history.

#### Correction Synthesis (Meta-Prompt)

A weekly background job reads the `NodeFeedback` and `EdgeFeedback` tables and runs a meta-prompt:

> *"Here are the last 40 corrections this user made. Identify patterns. Produce 5 specific, falsifiable rules that should govern how you process this user's sources going forward. Example of a good rule: 'Do not draw THEMATIC edges between ML and philosophy domain buckets unless the source contains a sentence that explicitly names both domains.' Return only a JSON array of rule strings."*

Claude synthesizes its own instruction update from your behavior. The resulting rules are versioned, stored in `UserCorrectionProfile`, and prepended to every agent system prompt. Users can view and override any rule in the Correction Profile view.

---

### 2.6 Semantic Deduplication

Node merging is solved at ingest time rather than deferred to lint. When Claude proposes new nodes, each is embedded using a lightweight embedding model (text-embedding-3-small or Voyage). Before writing, each new node is cosine-similarity checked against existing nodes.

- If similarity > **0.85**, Claude receives a secondary prompt: *"Node '[existing title]' already exists. Are these the same concept, a specialization, or a contradiction? Return one of: `MERGE`, `SPECIALIZE`, `CONTRADICT`, or `DISTINCT`."*
- Claude decides automatically in most cases.
- Ambiguous cases (Claude returns `DISTINCT` but similarity is still >0.85) surface in the user's review queue.

This runs in-band with the agent loop at negligible cost.

---

### 2.7 Graph Health & Linting

Periodically, Claude runs a health check over the graph. The user triggers this manually.

- **Find contradictions:** nodes that assert conflicting claims, flagged as contradiction annotations.
- **Find orphans:** nodes with no edges or very low total weight across all connections.
- **Find gaps:** important concepts mentioned in annotations but without their own node.
- **Find probable duplicates:** nodes that passed the 0.85 similarity threshold but were marked `DISTINCT`. Surface for manual review.
- **Suggest new sources:** based on current graph topology, Claude suggests what to read next.

---

## 3. Tech Stack

### 3.1 Frontend

| Technology | Role |
|------------|------|
| React + TypeScript + Vite | Component framework and build tooling |
| react-force-graph (2D) | Interactive force-directed graph canvas; node size = activity score; edge thickness = Hebbian weight; pending nodes rendered in dashed outline |
| Socket.io client | Receives real-time graph delta events from the backend as Claude writes |
| shadcn/ui + Tailwind CSS | UI components and styling |
| React Router | Multi-page routing: graph view, node detail, ingest panel, review queue, health report |

### 3.2 Backend

| Technology | Role |
|------------|------|
| Express + TypeScript | REST API server with JWT authentication |
| Prisma ORM + PostgreSQL | Type-safe data layer; schemas for User, Node, Edge, Annotation, Source, HealthReport, NodeFeedback, EdgeFeedback, UserCorrectionProfile |
| Socket.io server | Emits graph delta events to connected clients as Claude writes |
| Anthropic SDK (`claude-sonnet-4-20250514`) | Agentic loop with structured outputs; separate prompts for node extraction, edge drawing, and deduplication |
| Cheerio + node-fetch | URL fetching and HTML parsing for article ingestion |
| pdf-parse | PDF text extraction for file uploads |
| node-cron | Scheduled Hebbian decay job (24h) and weekly correction synthesis job |
| text-embedding-3-small / Voyage | Node embedding for semantic deduplication |

### 3.3 Deployment

- **Frontend:** Vercel (automatic deploys from main branch)
- **Backend + Database:** Railway (PostgreSQL + Express on the same platform)
- **Environment variables:** `ANTHROPIC_API_KEY`, `DATABASE_URL`, `JWT_SECRET`, `OPENAI_API_KEY` managed via Railway and Vercel dashboards

---

## 4. Data Model (Prisma Schema)

```prisma
model User {
  id                String                 @id @default(uuid())
  email             String                 @unique
  passwordHash      String
  createdAt         DateTime               @default(now())
  updatedAt         DateTime               @updatedAt
  nodes             Node[]
  sources           Source[]
  correctionProfile UserCorrectionProfile?
}

model Source {
  id           String     @id @default(uuid())
  userId       String
  type         SourceType // URL | PDF | TEXT | THOUGHT
  url          String?
  rawContent   String
  intentSignal String?    // per-source intent field
  processedAt  DateTime?
  createdAt    DateTime   @default(now())
  user         User       @relation(fields: [userId], references: [id])
  nodes        Node[]
}

model Node {
  id             String         @id @default(uuid())
  userId         String
  sourceId       String?
  title          String
  content        String
  tags           String[]
  activityScore  Float          @default(0.5)
  agentGenerated Boolean        @default(true)
  status         NodeStatus     // PENDING | COMMITTED | ARCHIVED
  confidence     Float
  embedding      Float[]
  domainBucket   String?
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt
  user           User           @relation(fields: [userId], references: [id])
  source         Source?        @relation(fields: [sourceId], references: [id])
  edgesFrom      Edge[]         @relation("FromNode")
  edgesTo        Edge[]         @relation("ToNode")
  annotations    Annotation[]
  feedback       NodeFeedback[]
}

model Edge {
  id             String         @id @default(uuid())
  userId         String
  fromNodeId     String
  toNodeId       String
  weight         Float          @default(0.5)
  type           EdgeType       // ASSOCIATIVE | CAUSAL | HIERARCHICAL | CONTRADICTS | THEMATIC
  sourceCitation String         // required — verbatim passage from source
  confidence     Float
  status         EdgeStatus     // PENDING | COMMITTED | ARCHIVED
  lastActivated  DateTime
  archived       Boolean        @default(false)
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt
  fromNode       Node           @relation("FromNode", fields: [fromNodeId], references: [id])
  toNode         Node           @relation("ToNode", fields: [toNodeId], references: [id])
  feedback       EdgeFeedback[]
}

model Annotation {
  id             String         @id @default(uuid())
  nodeId         String
  agentSessionId String
  content        String
  type           AnnotationType // SUMMARY | INSIGHT | CONTRADICTION | OPEN_QUESTION | SYNTHESIS
  createdAt      DateTime       @default(now())
  node           Node           @relation(fields: [nodeId], references: [id])
}

model NodeFeedback {
  id               String             @id @default(uuid())
  userId           String
  nodeId           String
  action           NodeFeedbackAction // APPROVED | RENAMED | REJECTED | MERGED
  newTitle         String?
  mergedIntoNodeId String?
  createdAt        DateTime           @default(now())
  node             Node               @relation(fields: [nodeId], references: [id])
}

model EdgeFeedback {
  id        String             @id @default(uuid())
  userId    String
  edgeId    String
  reason    EdgeFeedbackReason // NOT_RELATED | WRONG_TYPE | CONTEXT_SPECIFIC
  createdAt DateTime           @default(now())
  edge      Edge               @relation(fields: [edgeId], references: [id])
}

model UserCorrectionProfile {
  id          String   @id @default(uuid())
  userId      String   @unique
  rules       String[] // generated by meta-prompt, prepended to every agent call
  version     Int      @default(1)
  generatedAt DateTime
  updatedAt   DateTime @updatedAt
  user        User     @relation(fields: [userId], references: [id])
}

model AgentSession {
  id                String         @id @default(uuid())
  userId            String
  sourceId          String?
  trigger           SessionTrigger // INGEST | QUERY | LINT | CORRECTION_SYNTHESIS
  inputTokens       Int
  outputTokens      Int
  nodesCreated      Int
  edgesCreated      Int
  edgesStrengthened Int
  nodesRejected     Int            @default(0)
  edgesRejected     Int            @default(0)
  completedAt       DateTime?
  createdAt         DateTime       @default(now())
}
```

---

## 5. Agent Prompt Architecture

### 5.1 Prompt Separation

Rather than one monolithic prompt, the agent loop uses three focused prompts in sequence. Shorter, scoped prompts produce fewer errors and are easier to test independently.

| Prompt | Responsibility |
|--------|---------------|
| **Extraction prompt** | Reads source + existing node index. Returns candidate nodes with confidence scores. No edge drawing. |
| **Edge prompt** | Receives candidate nodes + existing graph. Draws edges with mandatory source citations. Returns edge proposals. |
| **Deduplication prompt** | Receives new nodes + similarity matches from embedding search. Returns `MERGE / SPECIALIZE / CONTRADICT / DISTINCT` for each match. |

### 5.2 Structured Outputs

All agent responses use Anthropic structured outputs — JSON schema enforced at the API level. This eliminates malformed JSON without retry logic.

**Extraction output schema:**
```json
{
  "newNodes": [
    {
      "title": "string (3-7 words)",
      "content": "string (1-3 sentences)",
      "tags": ["string"],
      "confidence": 0.0,
      "domainBucket": "string"
    }
  ],
  "synthesisSummary": "string (2-3 sentences)"
}
```

**Edge output schema:**
```json
{
  "newEdges": [
    {
      "fromNodeId": "string",
      "toNodeId": "string",
      "type": "ASSOCIATIVE | CAUSAL | HIERARCHICAL | CONTRADICTS | THEMATIC",
      "sourceCitation": "verbatim passage from source",
      "confidence": 0.0
    }
  ],
  "strengthenEdges": ["edgeId"],
  "annotations": [
    {
      "nodeId": "string",
      "type": "SUMMARY | INSIGHT | CONTRADICTION | OPEN_QUESTION | SYNTHESIS",
      "content": "string"
    }
  ]
}
```

### 5.3 System Prompt Construction

Every agent call assembles the system prompt in layers:

1. Base role and rules (static)
2. User's current correction profile rules (from `UserCorrectionProfile.rules[]`, versioned)
3. Domain isolation rules (inferred bucket pairs + their thresholds)
4. Per-source intent signal (if provided)
5. Few-shot examples of good and bad graph updates (2 concrete examples, static)

The correction profile rules are the dynamic layer that makes Claude's behavior specific to this user. Example generated rule: *"Do not draw THEMATIC edges between ML and philosophy domain buckets unless the source explicitly bridges them in a single sentence."*

### 5.4 Chain-of-Thought Scratchpad

Before emitting structured output, Claude reasons through what it's about to create in a scratchpad. The scratchpad is not parsed or stored — it is shown as a "Thinking…" animation in the ingest panel. The reasoning step reduces errors on ambiguous sources and makes the agent's behavior legible.

### 5.5 Ingest System Prompt (condensed)

```
You are MindGraph's knowledge agent. Your job is to read a new source
and integrate it into an existing knowledge graph.

Rules:
1. Never create a node that already exists. Reference existing nodes by ID.
2. Prefer connecting new nodes to existing ones over creating isolated clusters.
3. Every edge requires a sourceCitation: a verbatim sentence or phrase from
   the source that justifies it. No citation = no edge.
4. Flag contradictions explicitly. Do not resolve them silently.
5. Node titles must be atomic concepts (3–7 words). Content is 1–3 sentences.
6. Follow all user-specific rules listed below before applying your defaults.
7. Use structured output. No prose outside the JSON schema.

[USER CORRECTION PROFILE RULES INSERTED HERE]
[DOMAIN ISOLATION RULES INSERTED HERE]
[PER-SOURCE INTENT SIGNAL INSERTED HERE IF PROVIDED]
```

### 5.6 Query Prompt

When the user asks a question against the graph, Claude receives: the question, the full node index (titles + summaries), full content for the top N most relevant nodes (retrieved by embedding similarity), and the shortest path between the most relevant nodes if a path query is detected.

Claude returns: an answer with node citations, any new annotations generated by the query, and suggested follow-up questions. If the answer requires crossing a `CONTRADICTS` edge, the tension is surfaced to the user rather than resolved silently.

### 5.7 Lint Prompt

Receives the full graph and returns a structured health report: contradictions found, orphan nodes, gap concepts, probable duplicates above the 0.85 similarity threshold, and suggested next sources. Saved as a `HealthReport` record.

### 5.8 Correction Synthesis Prompt (meta-prompt)

Runs weekly via cron. Receives the last N node and edge feedback records. Returns an updated rules array (5 rules max) that replaces the current `UserCorrectionProfile`.

```
You are analyzing a user's correction history to infer their personal
preferences for knowledge graph construction.

Produce up to 5 specific, falsifiable rules. Each rule must name a specific
condition and a specific action.

Bad rule: "be more careful with connections."
Good rule: "do not draw THEMATIC edges between nodes in different domain
buckets unless the source contains a sentence that explicitly names both domains."

Return only a JSON array of rule strings.
```

---

## 6. API Routes

### 6.1 Auth

| Route | Description |
|-------|-------------|
| `POST /auth/register` | Create user account |
| `POST /auth/login` | Return JWT |
| `GET /auth/me` | Return current user (JWT required) |

### 6.2 Graph

| Route | Description |
|-------|-------------|
| `GET /graph` | Return full graph (nodes + edges) for current user |
| `GET /graph/delta?since=timestamp` | Return only updates since timestamp (for reconnect) |

### 6.3 Sources & Ingest

| Route | Description |
|-------|-------------|
| `POST /sources/ingest` | Submit URL, file, or text with optional `intentSignal` — triggers agent loop, streams via Socket.io |
| `GET /sources` | List all sources for current user |
| `GET /sources/:id` | Get source detail with associated nodes |

### 6.4 Nodes

| Route | Description |
|-------|-------------|
| `GET /nodes/:id` | Get full node detail with annotations and connected edges |
| `PATCH /nodes/:id` | Update node content (manual edits) |
| `DELETE /nodes/:id` | Archive a node (soft delete) |
| `POST /nodes/:id/feedback` | Submit node feedback (`APPROVED \| RENAMED \| REJECTED \| MERGED`) |

### 6.5 Edges

| Route | Description |
|-------|-------------|
| `POST /edges` | Manually create an edge |
| `PATCH /edges/:id/weight` | Manually adjust weight |
| `POST /edges/:id/feedback` | Submit edge feedback with reason |
| `POST /edges/decay` | Trigger manual decay run |

### 6.6 Agent

| Route | Description |
|-------|-------------|
| `POST /agent/query` | Ask a question against the graph |
| `POST /agent/lint` | Trigger a graph health check |
| `POST /agent/correction-synthesis` | Manually trigger correction profile update |
| `GET /agent/sessions` | List agent session history |

### 6.7 Review Queue

| Route | Description |
|-------|-------------|
| `GET /review/pending` | List all pending nodes and edges awaiting review |
| `POST /review/commit` | Commit a batch of pending items |
| `POST /review/reject` | Reject a batch of pending items |

### 6.8 Correction Profile

| Route | Description |
|-------|-------------|
| `GET /profile/corrections` | Return current `UserCorrectionProfile` (rules + version) |
| `PATCH /profile/corrections` | Override or delete specific rules |

---

## 7. Frontend Views

### 7.1 Graph Canvas (Main View)

The primary screen. A full-viewport force-directed graph rendered by react-force-graph. Nodes are sized by `activityScore`. Edges are weighted and colored by type. Pending nodes render with a dashed outline; pending edges render as dashed lines. The graph animates live as Socket.io events arrive.

- Clicking a node opens the Node Detail panel (slide-in drawer).
- A floating ingest button opens the Ingest Panel.
- A live activity feed in the bottom-right shows recent agent actions.
- A **Review Queue badge** shows the count of pending items awaiting approval.
- Minimap and zoom controls for large graphs.

### 7.2 Ingest Panel

A modal triggered from the graph canvas.

- **Tab 1: URL** — paste a link, optional intent field ("I'm adding this because…"), hit ingest.
- **Tab 2: File** — drag and drop PDF or `.txt`.
- **Tab 3: Thought** — a text area for quick ideas.

While ingesting, the panel shows a live log: "Thinking…" (scratchpad animation) → "Extracting concepts…" → "Creating node: Hebbian plasticity…" → "Drawing edge: Hebbian plasticity → synaptic strengthening (cited)…". The graph canvas updates in real time with pending items shown in dashed outline.

### 7.3 Review Queue *(new — most important new view)*

After each ingest, pending nodes and edges are shown here before being committed to the graph.

- Each proposed **node** shows: title, content, confidence score, source citation, and the four feedback buttons (✓ / ~ / ✗ / ⇌).
- Each proposed **edge** shows: the two connected nodes, edge type, confidence score, and the verbatim source citation that justified it.
- **Bulk actions:** "Approve all high-confidence" (>0.85), "Reject all low-confidence" (<0.5).
- Feedback submitted here is stored in `NodeFeedback` and `EdgeFeedback` and feeds the weekly correction synthesis.

### 7.4 Node Detail View

A slide-in drawer showing full node detail.

- Node title, full content, tags, source reference, creation date, domain bucket.
- Agent annotations listed chronologically.
- Connected nodes with edge type, weight, and source citation. Clicking a connected node navigates to it.
- A **"Develop this idea"** button that triggers an on-demand agent query focused on this node.

### 7.5 Develop This Idea Panel *(new)*

Triggered from the Node Detail view. Claude analyzes the node + its neighborhood + correction profile and returns:

- **What's missing:** "You have nodes on X and Z but nothing on Y, which is the bridge."
- **Suggested sources** to fill the gap — specific, not generic.
- **A synthesis document:** a short essay tracing your current thinking on this concept across all connected nodes.

This is the "second brain that thinks *back*" promise. It's what separates the product from a fancy note-taker.

### 7.6 Activity Feed

A chronological log of all agent sessions. Each entry shows trigger, timestamp, nodes created/modified, edges created/strengthened, and items rejected. Clicking an entry highlights the affected subgraph on the canvas.

### 7.7 Correction Profile View *(new)*

Shows the current `UserCorrectionProfile`: the rules Claude is currently following for this user, their version, and when they were last updated. Each rule can be overridden or deleted. A button triggers a manual correction synthesis run.

This view makes the learning system legible. The user can see exactly why Claude is behaving differently than it did on day one.

### 7.8 Graph Health Report

Generated by a lint pass. Shows: contradictions (pairs of conflicting nodes), orphans (isolated nodes), gap concepts (mentioned but not materialized), probable duplicates, and suggested next sources. Each item is actionable — clicking a contradiction highlights both nodes; clicking a gap concept triggers an agent query to develop it.

---

## 8. Real-Time Architecture (Socket.io)

Socket.io handles all live updates from agent sessions to the frontend. Events are structured as graph deltas — minimal payloads that the frontend merges into local state without re-fetching the full graph.

| Event | Frontend Action |
|-------|----------------|
| `agent:start` | Agent session began — show progress indicator and thinking animation |
| `agent:thinking` | Scratchpad chunk — update thinking animation text |
| `node:pending` | Pending node payload — render as dashed node, add to review queue badge |
| `node:created` | Committed node payload — promote to solid node |
| `edge:pending` | Pending edge payload — render as dashed edge |
| `edge:created` | Committed edge payload — promote to solid edge |
| `edge:strengthened` | Edge ID + new weight — update visual thickness |
| `annotation:created` | Annotation payload — update node detail if open |
| `agent:complete` | Session summary — hide progress, show activity feed entry, update review queue badge |
| `agent:error` | Error payload — show toast notification |

Multi-user graphs: Socket.io rooms are keyed by `userId`. Shared graphs (stretch goal) use a shared room ID.

---

## 9. Revised Milestones

### April 16 — Milestone (Core Loop Working)

The demo at milestone should show: paste a URL → Claude processes it → graph populates live with pending state → you can approve nodes → committed nodes appear solid → click a node and see its detail.

**Must be complete:**

1. Prisma schema: User, Source, Node, Edge, Annotation, AgentSession, NodeFeedback, EdgeFeedback, UserCorrectionProfile — all with correct relations and constraints.
2. Express API: auth (JWT), `POST /sources/ingest`, `GET /graph`, `GET /nodes/:id`, `POST /nodes/:id/feedback`. Other routes stubbed.
3. Ingest pipeline: URL fetching (Cheerio + node-fetch), text extraction, agent loop with structured outputs, separate extraction and edge prompts, database writes.
4. Mandatory edge citations enforced in agent prompt. Tested against 3+ URLs before milestone.
5. Socket.io: server emits `node:pending`, `edge:pending`, `node:created`, `edge:created`, `agent:complete`. Client receives and re-renders.
6. React frontend: graph canvas with pending/committed visual states, ingest panel (URL tab + intent field), basic review queue (approve/reject per node).
7. End-to-end: a URL ingested on one laptop appears on another laptop's graph in real time.

**Stretch for milestone:**
- PDF tab in ingest panel.
- Embedding-based deduplication (dedup prompt on similarity matches).
- Quick thought tab.

### April 23 — Demo (Full Vision)

The demo should tell a story: feed the graph 5–6 sources over 2 minutes, show the review queue catching a bad connection, ask it a question and show the answer citing nodes. The graph should visibly evolve — new clusters forming, edges thickening.

**Must be complete:**

1. All three ingest types working: URL, PDF, quick thought.
2. Review queue fully functional: per-node and per-edge feedback with reason, bulk approve/reject actions.
3. Hebbian weight updates: edges visually thicken on co-activation. Decay job running.
4. Semantic deduplication: embedding similarity check + dedup prompt running on every ingest.
5. Agent query: graph-aware (embedding retrieval, not keyword match). Returns answer with node citations and flags `CONTRADICTS` paths.
6. Correction profile: `UserCorrectionProfile` generated from feedback, prepended to system prompt, visible and editable in UI.
7. Develop This Idea: gap analysis, synthesis document, source suggestions.
8. Graph health: lint pass with duplicate detection. Health report displayed in frontend.
9. Activity feed: all agent sessions logged with rejection counts visible.
10. Deployed: accessible at a public URL on Vercel + Railway.
11. Multi-source coherence: ingesting two related sources produces shared nodes and strengthened edges — demonstrable live in the demo.

---

## 10. Open Questions & Decisions Needed

| Question | Current Thinking |
|----------|-----------------|
| Graph ownership | Per-user to start; shared graphs are a stretch goal. |
| Context window for large graphs | Send compressed index (titles + domain buckets only) plus full content for top N nodes retrieved by embedding similarity. Set N=20 as starting threshold. |
| Decay during active sessions | Pause decay for edges touched in the current session. Only decay edges untouched for 7+ days. |
| Source deduplication | Check URL hash on ingest; return existing source nodes rather than re-processing. |
| Correction profile cold start | New users have no feedback history. Default: require source citations for all edges, no cross-domain thematic edges without explicit citation. First correction overrides the default. |
| Embedding model choice | `text-embedding-3-small` is cheap and fast. Voyage AI is higher quality for technical text. Start with `text-embedding-3-small`; swap if dedup quality is poor. |
| Review queue fatigue | If a user never reviews the queue, pending items accumulate. After 48 hours, high-confidence pending items (>0.85) auto-commit. Low-confidence items are archived. |

---

## Appendix: Inspiration & References

- **Andrej Karpathy's LLM Knowledge Base pattern** — personal wiki compiled by LLMs from raw sources, browsed in Obsidian
- **Vannevar Bush's Memex (1945)** — private, curated knowledge store with associative trails
- **Obsidian graph view** — visual exploration of a linked knowledge base
- **Hebbian learning (Donald Hebb, 1949)** — "neurons that fire together, wire together"
- **NotebookLM, ChatGPT file uploads** — prior art showing user appetite for LLM-powered personal knowledge tools, and their key limitation: no persistence, no compounding, no correction loop
- **RLHF & Constitutional AI** — inspiration for the correction synthesis pattern: infer preferences from behavior rather than asking for them explicitly