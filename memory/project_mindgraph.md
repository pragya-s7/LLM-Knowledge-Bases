---
name: MindGraph project context
description: Full-stack knowledge graph OS being built for CIS 1962 Spring 2026 — milestones April 16 and April 23
type: project
---

MindGraph is a knowledge graph OS where Claude builds/connects nodes from ingested sources. Pragya & Darsh are building it together.

**Why:** CIS 1962 course project, milestone April 16 (core loop), demo April 23.

**Stack:** React + Vite + react-force-graph-2d frontend; Express + Prisma + PostgreSQL backend; Anthropic SDK (claude-sonnet-4-6) for agents; OpenAI text-embedding-3-small for embeddings; Socket.io for real-time; Railway + Vercel for deployment.

**Repo location:** /Users/pragya/Documents/LLM-Knowledge-Bases (monorepo: backend/, frontend/)

**Key architecture decisions made:**
- No extended thinking / streaming — standard structured outputs via tool_use for cost/simplicity
- pgvector for embeddings (not Float[])
- Three-prompt agent loop: extraction → dedup → edges
- Auto-commit at confidence >0.85; auto-archive pending after 48h

**How to apply:** When continuing implementation, check todo.md for current state.
