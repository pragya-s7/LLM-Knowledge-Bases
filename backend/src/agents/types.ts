export interface CandidateNode {
  title: string;
  content: string;
  tags: string[];
  confidence: number;
  domainBucket: string;
}

export interface ExtractionResult {
  newNodes: CandidateNode[];
  synthesisSummary: string;
}

export interface EdgeProposal {
  fromNodeTitle: string; // we match by title after node creation
  toNodeTitle: string;
  type: 'ASSOCIATIVE' | 'CAUSAL' | 'HIERARCHICAL' | 'CONTRADICTS' | 'THEMATIC';
  sourceCitation: string;
  confidence: number;
}

export interface AnnotationProposal {
  nodeTitle: string;
  type: 'SUMMARY' | 'INSIGHT' | 'CONTRADICTION' | 'OPEN_QUESTION' | 'SYNTHESIS';
  content: string;
}

export interface EdgeResult {
  newEdges: EdgeProposal[];
  strengthenEdgeTitles: string[][]; // pairs of node titles whose edge to strengthen
  annotations: AnnotationProposal[];
}

export type DeduplicationDecision = 'MERGE' | 'SPECIALIZE' | 'CONTRADICT' | 'DISTINCT';

export interface DeduplicationResult {
  decisions: Array<{
    newNodeTitle: string;
    existingNodeTitle: string;
    decision: DeduplicationDecision;
  }>;
}

export interface GraphContext {
  nodes: Array<{
    id: string;
    title: string;
    content: string;
    tags: string[];
    domainBucket: string | null;
    activityScore: number;
  }>;
  edges: Array<{
    id: string;
    fromNodeId: string;
    toNodeId: string;
    type: string;
    weight: number;
  }>;
  correctionRules: string[];
}
