export type NodeStatus = 'PENDING' | 'COMMITTED' | 'ARCHIVED';
export type EdgeStatus = 'PENDING' | 'COMMITTED' | 'ARCHIVED';
export type EdgeType = 'ASSOCIATIVE' | 'CAUSAL' | 'HIERARCHICAL' | 'CONTRADICTS' | 'THEMATIC';
export type AnnotationType = 'SUMMARY' | 'INSIGHT' | 'CONTRADICTION' | 'OPEN_QUESTION' | 'SYNTHESIS';
export type NodeFeedbackAction = 'APPROVED' | 'RENAMED' | 'REJECTED' | 'MERGED';
export type EdgeFeedbackReason = 'NOT_RELATED' | 'WRONG_TYPE' | 'CONTEXT_SPECIFIC';
export type SourceType = 'URL' | 'PDF' | 'TEXT' | 'THOUGHT';

export interface GraphNode {
  id: string;
  title: string;
  content: string;
  tags: string[];
  activityScore: number;
  status: NodeStatus;
  confidence: number;
  domainBucket: string | null;
  sourceId: string | null;
  createdAt: string;
}

export interface GraphEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  weight: number;
  type: EdgeType;
  sourceCitation: string;
  confidence: number;
  status: EdgeStatus;
  lastActivated: string;
}

export interface Annotation {
  id: string;
  nodeId: string;
  agentSessionId: string;
  content: string;
  type: AnnotationType;
  createdAt: string;
}

export interface NodeDetail extends GraphNode {
  annotations: Annotation[];
  edgesFrom: Array<GraphEdge & { toNode: { id: string; title: string } }>;
  edgesTo: Array<GraphEdge & { fromNode: { id: string; title: string } }>;
  source: { id: string; type: SourceType; url: string | null } | null;
}

export interface PendingNode {
  id: string;
  title: string;
  content: string;
  tags: string[];
  confidence: number;
  domainBucket: string | null;
  sourceId: string | null;
  createdAt: string;
}

export interface PendingEdge {
  id: string;
  fromNode: { id: string; title: string };
  toNode: { id: string; title: string };
  type: EdgeType;
  sourceCitation: string;
  confidence: number;
  status: EdgeStatus;
}

export interface AgentSession {
  id: string;
  userId: string;
  sourceId: string | null;
  trigger: 'INGEST' | 'QUERY' | 'LINT' | 'CORRECTION_SYNTHESIS';
  inputTokens: number;
  outputTokens: number;
  nodesCreated: number;
  edgesCreated: number;
  edgesStrengthened: number;
  nodesRejected: number;
  edgesRejected: number;
  completedAt: string | null;
  createdAt: string;
  source: { type: SourceType; url: string | null } | null;
}



export interface QueryResult {
  answer: string;
  citedNodeIds: string[];
  contradictionSurfaced: boolean;
  contradictionDetail?: string;
  followUpQuestions: string[];
  newAnnotations: Annotation[];
}
