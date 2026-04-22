import { useState, useEffect } from 'react';
import { X, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { NodeDetail } from '../types';

const ANNOTATION_COLORS: Record<string, string> = {
  SUMMARY: 'bg-blue-900/40 border-blue-700',
  INSIGHT: 'bg-purple-900/40 border-purple-700',
  CONTRADICTION: 'bg-red-900/40 border-red-700',
  OPEN_QUESTION: 'bg-yellow-900/40 border-yellow-700',
  SYNTHESIS: 'bg-green-900/40 border-green-700',
};

interface Props {
  nodeId: string;
  onClose: () => void;
  onNavigateToNode: (id: string) => void;
}

export default function NodeDetailDrawer({ nodeId, onClose, onNavigateToNode }: Props) {
  const [node, setNode] = useState<NodeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    api.nodes.get(nodeId).then(n => { setNode(n); setLoading(false); }).catch(console.error);
  }, [nodeId]);

  return (
    <div className="fixed right-0 top-14 bottom-0 w-96 bg-gray-900 border-l border-gray-800 z-40 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 flex-shrink-0">
        <h3 className="font-semibold text-white truncate mr-2">{loading ? '…' : node?.title}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white flex-shrink-0 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center flex-1 text-gray-400">Loading…</div>
      ) : node ? (
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Content */}
          <div>
            <p className="text-gray-300 text-sm leading-relaxed">{node.content}</p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {node.tags.map(tag => (
                <span key={tag} className="bg-gray-800 text-gray-400 text-xs px-2 py-0.5 rounded-full">{tag}</span>
              ))}
              {node.domainBucket && (
                <span className="bg-brand-500/20 text-brand-400 text-xs px-2 py-0.5 rounded-full">{node.domainBucket}</span>
              )}
            </div>
          </div>

          {/* Confidence + status */}
          <div className="flex gap-4 text-xs text-gray-500">
            <span>Confidence: <span className="text-gray-300">{(node.confidence * 100).toFixed(0)}%</span></span>
            <span>Status: <span className={node.status === 'COMMITTED' ? 'text-green-400' : 'text-yellow-400'}>{node.status}</span></span>
          </div>

          {/* Annotations */}
          {node.annotations.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Agent Notes</h4>
              <div className="space-y-2">
                {node.annotations.map(ann => (
                  <div key={ann.id} className={`rounded-lg border px-3 py-2 text-sm ${ANNOTATION_COLORS[ann.type] ?? 'bg-gray-800 border-gray-700'}`}>
                    <span className="text-xs text-gray-500 block mb-0.5">{ann.type}</span>
                    {ann.content}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Connected nodes */}
          {(node.edgesFrom.length > 0 || node.edgesTo.length > 0) && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Connections</h4>
              <div className="space-y-1.5">
                {node.edgesFrom.map(edge => (
                  <button
                    key={edge.id}
                    onClick={() => onNavigateToNode(edge.toNode.id)}
                    className="w-full flex items-center gap-2 text-left bg-gray-800 hover:bg-gray-750 rounded-lg px-3 py-2 text-sm transition-colors"
                  >
                    <span className="text-gray-400 text-xs w-20 flex-shrink-0">w: {edge.weight.toFixed(2)}</span>
                    <span className="text-gray-200 truncate">{edge.toNode.title}</span>
                    <ChevronRight className="w-3 h-3 text-gray-500 ml-auto flex-shrink-0" />
                  </button>
                ))}
                {node.edgesTo.map(edge => (
                  <button
                    key={edge.id}
                    onClick={() => onNavigateToNode(edge.fromNode.id)}
                    className="w-full flex items-center gap-2 text-left bg-gray-800 hover:bg-gray-750 rounded-lg px-3 py-2 text-sm transition-colors"
                  >
                    <span className="text-gray-400 text-xs w-20 flex-shrink-0">← w: {edge.weight.toFixed(2)}</span>
                    <span className="text-gray-200 truncate">{edge.fromNode.title}</span>
                    <ChevronRight className="w-3 h-3 text-gray-500 ml-auto flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Source */}
          {node.source?.url && (
            <div className="text-xs text-gray-500">
              Source: <a href={node.source.url} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:underline">{node.source.url}</a>
            </div>
          )}

        </div>
      ) : (
        <div className="flex items-center justify-center flex-1 text-gray-400">Node not found</div>
      )}
    </div>
  );
}
