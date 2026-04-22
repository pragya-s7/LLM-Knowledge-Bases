import { GraphContext } from './types';

export function buildExtractionSystemPrompt(ctx: GraphContext, intentSignal?: string): string {
  // Limit to 30 most recent nodes to keep the prompt manageable
  const recentNodes = ctx.nodes.slice(-30);
  const nodeIndex = recentNodes
    .map(n => `- "${n.title}" (domain: ${n.domainBucket ?? 'unknown'})`)
    .join('\n');
  const truncatedNote = ctx.nodes.length > 30
    ? `\n(showing 30 of ${ctx.nodes.length} existing nodes — avoid duplicating similar concepts)`
    : '';

  const correctionRules = ctx.correctionRules.length > 0
    ? `\n## User-Specific Rules (follow these before your defaults)\n${ctx.correctionRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
    : '';

  const intent = intentSignal
    ? `\n## Per-Source Intent\nThe user added this source because: "${intentSignal}". Prioritize concepts relevant to this goal.`
    : '';

  return `You are MindGraph's knowledge extraction agent. Your job is to read a new source and identify the key concepts to add to a knowledge graph.

## Existing Nodes (avoid duplicating these exact concepts)
${nodeIndex || '(empty graph — this is the first source)'}${truncatedNote}
${correctionRules}${intent}

## Rules
1. Always extract 3–8 important concepts from the source, even if the graph already has nodes from other domains. Different topics belong in the same graph.
2. Node titles must be 3–7 words. The "content" field MUST be a 1–3 sentence factual summary — never null, never omitted.
3. Only skip a concept if an existing node covers it with the SAME title or meaning. Do not skip concepts from a new domain.
4. Assign each node a domainBucket (a short lowercase label like "history", "biology", "politics", "economics").
5. Confidence 0.0–1.0: how certain you are this is a distinct, useful concept. Use 0.8+ for clear facts.
6. Return ONLY a valid JSON object with no prose, no markdown, no code fences. Exactly this shape:
{"newNodes":[{"title":"string","content":"string","tags":["string"],"confidence":0.0,"domainBucket":"string"}],"synthesisSummary":"string"}`;
}

export function buildEdgeSystemPrompt(ctx: GraphContext, intentSignal?: string): string {
  // Limit to 40 nodes to keep prompt size manageable; prioritize recent (end of array)
  const nodesToShow = ctx.nodes.length > 40 ? ctx.nodes.slice(-40) : ctx.nodes;
  const allNodes = nodesToShow
    .map(n => `- "${n.title}" (domain: ${n.domainBucket ?? 'unknown'})`)
    .join('\n');

  const domainPairs = getDomainPairs(ctx);

  const correctionRules = ctx.correctionRules.length > 0
    ? `\n## User-Specific Rules\n${ctx.correctionRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
    : '';

  const intent = intentSignal
    ? `\n## Per-Source Intent\nThe user added this source because: "${intentSignal}".`
    : '';

  return `You are MindGraph's edge drawing agent. Your job is to draw relationships between concepts in a knowledge graph.

## All Nodes (existing + newly proposed)
${allNodes}
${correctionRules}${intent}

## Domain Isolation Rules
${domainPairs}

## Rules
1. Every edge REQUIRES a sourceCitation: a verbatim sentence or phrase from the source that justifies the connection. No citation = no edge.
2. Inferential connections without direct textual support must have confidence < 0.6.
3. Flag contradictions (CONTRADICTS type) explicitly. Do not resolve them.
4. Cross-domain THEMATIC edges require the source to explicitly bridge both domains in a single sentence.
5. Prefer connecting new nodes to existing nodes over creating isolated clusters.
6. strengthenEdgeTitles: list pairs of existing node titles whose relationship is reinforced by this source.
7. Return ONLY a valid JSON object with no prose, no markdown, no code fences. Exactly this shape:
{"newEdges":[{"fromNodeTitle":"string","toNodeTitle":"string","sourceCitation":"string","confidence":0.0}],"strengthenEdgeTitles":[["nodeA","nodeB"]],"annotations":[{"nodeTitle":"string","type":"SUMMARY","content":"string"}]}`;
}

function getDomainPairs(ctx: GraphContext): string {
  const domains = [...new Set(ctx.nodes.map(n => n.domainBucket).filter(Boolean))];
  if (domains.length < 2) return 'No cross-domain rules yet (graph is new).';
  return `Detected domain buckets: ${domains.join(', ')}. Cross-domain THEMATIC edges require explicit bridging citation.`;
}

export function buildQuerySystemPrompt(ctx: GraphContext): string {
  const nodeIndex = ctx.nodes
    .map(n => `[${n.id}] "${n.title}": ${n.content}`)
    .join('\n');

  return `You are MindGraph's query agent. Answer questions using only the knowledge in this graph.

## Knowledge Graph
${nodeIndex}

## Rules
1. Cite specific node IDs for every claim in your answer.
2. If the answer path crosses a CONTRADICTS edge, surface the tension — do not resolve it.
3. Suggest 2–3 follow-up questions the user might find useful.
4. Return ONLY a valid JSON object with no prose, no markdown, no code fences. Exactly this shape:
{"answer":"string","citedNodeIds":["string"],"contradictionSurfaced":false,"contradictionDetail":"string","followUpQuestions":["string"],"newAnnotations":[{"nodeId":"string","type":"INSIGHT","content":"string"}]}`;
}

export function buildLintSystemPrompt(): string {
  return `You are MindGraph's graph health agent. Analyze this knowledge graph and find structural issues.

## Rules
1. Contradictions: nodes with directly conflicting claims.
2. Orphans: nodes with no committed edges.
3. Gaps: important concepts mentioned in node content but without their own node.
4. Probable duplicates: conceptually overlapping nodes that should be reviewed.
5. Suggested sources: based on the graph's shape, what should the user read next?
6. Return ONLY a valid JSON object with no prose, no markdown, no code fences. Exactly this shape:
{"contradictions":[{"nodeATitle":"string","nodeBTitle":"string","reason":"string"}],"orphans":["string"],"gaps":[{"concept":"string","mentionedInNodeTitle":"string"}],"probableDuplicates":[{"nodeATitle":"string","nodeBTitle":"string","reason":"string"}],"suggestedSources":[{"title":"string","reason":"string"}]}`;
}

export function buildCorrectionSynthesisPrompt(): string {
  return `You are analyzing a user's correction history to infer their personal preferences for knowledge graph construction.

Produce up to 5 specific, falsifiable rules. Each rule must name a specific condition and a specific action.

Bad rule: "be more careful with connections."
Good rule: "do not draw THEMATIC edges between nodes in different domain buckets unless the source contains a sentence that explicitly names both domains."

Return only a JSON array of rule strings.`;
}
