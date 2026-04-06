import { useState, useEffect, useCallback } from 'react';
import { Check, X, Edit2, Merge } from 'lucide-react';
import { api } from '../lib/api';
import { PendingNode, PendingEdge, NodeFeedbackAction, EdgeFeedbackReason } from '../types';
import NavBar from '../components/NavBar';

const EDGE_TYPE_COLORS: Record<string, string> = {
  ASSOCIATIVE: 'text-indigo-400',
  CAUSAL: 'text-amber-400',
  HIERARCHICAL: 'text-emerald-400',
  CONTRADICTS: 'text-red-400',
  THEMATIC: 'text-purple-400',
};

export default function ReviewPage() {
  const [nodes, setNodes] = useState<PendingNode[]>([]);
  const [edges, setEdges] = useState<PendingEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const loadPending = useCallback(async () => {
    setLoading(true);
    const data = await api.review.pending();
    setNodes(data.nodes);
    setEdges(data.edges);
    setLoading(false);
  }, []);

  useEffect(() => { loadPending(); }, [loadPending]);

  async function handleNodeFeedback(id: string, action: NodeFeedbackAction, extra?: any) {
    await api.nodes.feedback(id, action, extra);
    setNodes(prev => prev.filter(n => n.id !== id));
  }

  async function handleEdgeFeedback(id: string, reason: EdgeFeedbackReason) {
    await api.edges.feedback(id, reason);
    setEdges(prev => prev.filter(e => e.id !== id));
  }

  async function bulkApproveHighConfidence() {
    const highConf = nodes.filter(n => n.confidence >= 0.85);
    const highConfEdges = edges.filter(e => e.confidence >= 0.85);
    if (highConf.length === 0 && highConfEdges.length === 0) return;
    await api.review.commit(highConf.map(n => n.id), highConfEdges.map(e => e.id));
    setNodes(prev => prev.filter(n => n.confidence < 0.85));
    setEdges(prev => prev.filter(e => e.confidence < 0.85));
  }

  async function bulkRejectLowConfidence() {
    const low = nodes.filter(n => n.confidence < 0.5);
    const lowEdges = edges.filter(e => e.confidence < 0.5);
    if (low.length === 0 && lowEdges.length === 0) return;
    await api.review.reject(low.map(n => n.id), lowEdges.map(e => e.id));
    setNodes(prev => prev.filter(n => n.confidence >= 0.5));
    setEdges(prev => prev.filter(e => e.confidence >= 0.5));
  }

  const totalPending = nodes.length + edges.length;

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      <NavBar pendingCount={totalPending} />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Review Queue</h1>
              <p className="text-gray-400 text-sm mt-0.5">{totalPending} items awaiting review</p>
            </div>
            {totalPending > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={bulkApproveHighConfidence}
                  className="text-sm bg-green-800 hover:bg-green-700 text-green-200 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Approve all &gt;85%
                </button>
                <button
                  onClick={bulkRejectLowConfidence}
                  className="text-sm bg-red-900 hover:bg-red-800 text-red-200 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Reject all &lt;50%
                </button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="text-gray-400 text-center py-16">Loading…</div>
          ) : totalPending === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <Check className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>All caught up. Queue is empty.</p>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Nodes */}
              {nodes.length > 0 && (
                <section>
                  <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
                    Proposed Nodes ({nodes.length})
                  </h2>
                  <div className="space-y-3">
                    {nodes.map(node => (
                      <div key={node.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                        {renameId === node.id ? (
                          <div className="flex gap-2 mb-2">
                            <input
                              autoFocus
                              value={renameValue}
                              onChange={e => setRenameValue(e.target.value)}
                              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-brand-500"
                            />
                            <button
                              onClick={() => { handleNodeFeedback(node.id, 'RENAMED', { newTitle: renameValue }); setRenameId(null); }}
                              className="bg-brand-500 text-white text-sm px-3 py-1.5 rounded-lg"
                            >
                              Save
                            </button>
                            <button onClick={() => setRenameId(null)} className="text-gray-400 hover:text-white px-2">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <h3 className="font-medium text-white">{node.title}</h3>
                            <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                              node.confidence >= 0.85 ? 'bg-green-900/50 text-green-400' :
                              node.confidence >= 0.5 ? 'bg-yellow-900/50 text-yellow-400' :
                              'bg-red-900/50 text-red-400'
                            }`}>
                              {(node.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                        )}
                        <p className="text-gray-400 text-sm mb-3">{node.content}</p>
                        {node.domainBucket && (
                          <span className="text-xs text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-full mr-2">{node.domainBucket}</span>
                        )}
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => handleNodeFeedback(node.id, 'APPROVED')}
                            className="flex items-center gap-1 text-xs bg-green-900/40 hover:bg-green-900/70 text-green-300 border border-green-800 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <Check className="w-3 h-3" /> Good
                          </button>
                          <button
                            onClick={() => { setRenameId(node.id); setRenameValue(node.title); }}
                            className="flex items-center gap-1 text-xs bg-blue-900/40 hover:bg-blue-900/70 text-blue-300 border border-blue-800 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-3 h-3" /> Rename
                          </button>
                          <button
                            onClick={() => handleNodeFeedback(node.id, 'REJECTED')}
                            className="flex items-center gap-1 text-xs bg-red-900/40 hover:bg-red-900/70 text-red-300 border border-red-800 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <X className="w-3 h-3" /> Wrong
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Edges */}
              {edges.length > 0 && (
                <section>
                  <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
                    Proposed Edges ({edges.length})
                  </h2>
                  <div className="space-y-3">
                    {edges.map(edge => (
                      <div key={edge.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-white font-medium text-sm">{edge.fromNode.title}</span>
                          <span className={`text-xs font-mono ${EDGE_TYPE_COLORS[edge.type] ?? 'text-gray-400'}`}>—{edge.type}→</span>
                          <span className="text-white font-medium text-sm">{edge.toNode.title}</span>
                          <span className={`ml-auto text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                            edge.confidence >= 0.85 ? 'bg-green-900/50 text-green-400' :
                            edge.confidence >= 0.5 ? 'bg-yellow-900/50 text-yellow-400' :
                            'bg-red-900/50 text-red-400'
                          }`}>
                            {(edge.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                        <blockquote className="text-gray-400 text-xs border-l-2 border-gray-700 pl-3 italic mb-3">
                          "{edge.sourceCitation}"
                        </blockquote>
                        <div className="flex gap-2">
                          <button
                            onClick={() => api.review.commit([], [edge.id]).then(() => setEdges(prev => prev.filter(e => e.id !== edge.id)))}
                            className="flex items-center gap-1 text-xs bg-green-900/40 hover:bg-green-900/70 text-green-300 border border-green-800 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <Check className="w-3 h-3" /> Approve
                          </button>
                          <button
                            onClick={() => handleEdgeFeedback(edge.id, 'NOT_RELATED')}
                            className="flex items-center gap-1 text-xs bg-red-900/40 hover:bg-red-900/70 text-red-300 border border-red-800 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <X className="w-3 h-3" /> Not related
                          </button>
                          <button
                            onClick={() => handleEdgeFeedback(edge.id, 'WRONG_TYPE')}
                            className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Wrong type
                          </button>
                          <button
                            onClick={() => handleEdgeFeedback(edge.id, 'CONTEXT_SPECIFIC')}
                            className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Context only
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
