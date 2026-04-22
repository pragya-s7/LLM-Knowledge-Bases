import OpenAI from 'openai';

export const extractionTool: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'extract_nodes',
    description: 'Extract candidate knowledge nodes from a source document.',
    parameters: {
      type: 'object',
      properties: {
        newNodes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: '3-7 word concept title' },
              content: { type: 'string', description: '1-3 sentence description' },
              tags: { type: 'array', items: { type: 'string' } },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              domainBucket: { type: 'string', description: 'Short lowercase domain label' },
            },
            required: ['title', 'content', 'tags', 'confidence', 'domainBucket'],
          },
        },
        synthesisSummary: { type: 'string', description: '2-3 sentence summary of what this source adds to the graph' },
      },
      required: ['newNodes', 'synthesisSummary'],
    },
  },
};

export const edgeTool: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'draw_edges',
    description: 'Draw edges between nodes in the knowledge graph.',
    parameters: {
      type: 'object',
      properties: {
        newEdges: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              fromNodeTitle: { type: 'string' },
              toNodeTitle: { type: 'string' },
              type: { type: 'string', enum: ['ASSOCIATIVE', 'CAUSAL', 'HIERARCHICAL', 'CONTRADICTS', 'THEMATIC'] },
              sourceCitation: { type: 'string', description: 'Verbatim passage from source justifying this edge' },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['fromNodeTitle', 'toNodeTitle', 'type', 'sourceCitation', 'confidence'],
          },
        },
        strengthenEdgeTitles: {
          type: 'array',
          description: 'Pairs of node titles whose existing edge should be strengthened',
          items: {
            type: 'array',
            items: { type: 'string' },
            minItems: 2,
            maxItems: 2,
          },
        },
        annotations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              nodeTitle: { type: 'string' },
              type: { type: 'string', enum: ['SUMMARY', 'INSIGHT', 'CONTRADICTION', 'OPEN_QUESTION', 'SYNTHESIS'] },
              content: { type: 'string' },
            },
            required: ['nodeTitle', 'type', 'content'],
          },
        },
      },
      required: ['newEdges', 'strengthenEdgeTitles', 'annotations'],
    },
  },
};

export const deduplicationTool: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'deduplicate_nodes',
    description: 'Decide whether new nodes are duplicates, specializations, or distinct from existing similar nodes.',
    parameters: {
      type: 'object',
      properties: {
        decisions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              newNodeTitle: { type: 'string' },
              existingNodeTitle: { type: 'string' },
              decision: { type: 'string', enum: ['MERGE', 'SPECIALIZE', 'CONTRADICT', 'DISTINCT'] },
            },
            required: ['newNodeTitle', 'existingNodeTitle', 'decision'],
          },
        },
      },
      required: ['decisions'],
    },
  },
};

export const queryTool: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'answer_query',
    description: 'Answer a user question using the knowledge graph.',
    parameters: {
      type: 'object',
      properties: {
        answer: { type: 'string' },
        citedNodeIds: { type: 'array', items: { type: 'string' } },
        contradictionSurfaced: { type: 'boolean' },
        contradictionDetail: { type: 'string' },
        followUpQuestions: { type: 'array', items: { type: 'string' }, maxItems: 3 },
        newAnnotations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              nodeId: { type: 'string' },
              type: { type: 'string', enum: ['SUMMARY', 'INSIGHT', 'CONTRADICTION', 'OPEN_QUESTION', 'SYNTHESIS'] },
              content: { type: 'string' },
            },
            required: ['nodeId', 'type', 'content'],
          },
        },
      },
      required: ['answer', 'citedNodeIds', 'contradictionSurfaced', 'followUpQuestions', 'newAnnotations'],
    },
  },
};

export const lintTool: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'graph_health_report',
    description: 'Produce a health report for the knowledge graph.',
    parameters: {
      type: 'object',
      properties: {
        contradictions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              nodeATitle: { type: 'string' },
              nodeBTitle: { type: 'string' },
              reason: { type: 'string' },
            },
            required: ['nodeATitle', 'nodeBTitle', 'reason'],
          },
        },
        orphans: { type: 'array', items: { type: 'string' }, description: 'Node titles with no edges' },
        gaps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              concept: { type: 'string' },
              mentionedInNodeTitle: { type: 'string' },
            },
            required: ['concept', 'mentionedInNodeTitle'],
          },
        },
        probableDuplicates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              nodeATitle: { type: 'string' },
              nodeBTitle: { type: 'string' },
              reason: { type: 'string' },
            },
            required: ['nodeATitle', 'nodeBTitle', 'reason'],
          },
        },
        suggestedSources: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              reason: { type: 'string' },
            },
            required: ['title', 'reason'],
          },
        },
      },
      required: ['contradictions', 'orphans', 'gaps', 'probableDuplicates', 'suggestedSources'],
    },
  },
};
