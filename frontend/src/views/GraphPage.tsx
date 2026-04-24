import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import { api } from '../lib/api';
import { useSocketEvent } from '../hooks/useSocket';
import { GraphNode, GraphEdge } from '../types';
import IngestPanel from '../components/IngestPanel';
import NodeDetailDrawer from '../components/NodeDetailDrawer';
import ActivityFeedWidget from '../components/ActivityFeedWidget';
import NavBar from '../components/NavBar';


interface ForceNode extends GraphNode {
  x?: number;
  y?: number;
}

interface ForceLink extends GraphEdge {
  source: string;
  target: string;
}

export default function GraphPage() {
  const navigate = useNavigate();
  const graphRef = useRef<ForceGraphMethods>();
  const [nodes, setNodes] = useState<ForceNode[]>([]);
  const [edges, setEdges] = useState<ForceLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [ingestOpen, setIngestOpen] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initial graph load
  useEffect(() => {
    api.graph.get().then(({ nodes: n, edges: e }) => {
      setNodes(n as ForceNode[]);
      setEdges(e.map(edge => ({ ...edge, source: edge.fromNodeId, target: edge.toNodeId })));
      setLoading(false);
    }).catch(console.error);

    api.review.pending().then(({ nodes: pn }) => {
      setPendingCount(pn.length);
    }).catch(() => {});
  }, []);

  // Socket events

  useSocketEvent('node:pending', useCallback((data) => {
    setNodes(prev => {
      if (prev.find(n => n.id === data.id)) return prev;
      return [...prev, { ...data, status: 'PENDING' } as ForceNode];
    });
    setPendingCount(c => c + 1);
  }, []));

  useSocketEvent('node:created', useCallback((data) => {
    setNodes(prev => prev.map(n =>
      n.id === data.id ? { ...n, status: 'COMMITTED', ...(data.title ? { title: data.title } : {}) } : n
    ));
  }, []));

  useSocketEvent('edge:pending', useCallback((data) => {
    setEdges(prev => {
      if (prev.find(e => e.id === data.id)) return prev;
      return [...prev, { ...data, source: data.fromNodeId, target: data.toNodeId, status: 'PENDING' }];
    });
  }, []));

  useSocketEvent('edge:created', useCallback((data) => {
    setEdges(prev => prev.map(e => e.id === data.id ? { ...e, status: 'COMMITTED' } : e));
  }, []));

  useSocketEvent('edge:strengthened', useCallback((data) => {
    setEdges(prev => prev.map(e => e.id === data.id ? { ...e, weight: data.weight } : e));
  }, []));

  useSocketEvent('agent:error', useCallback((data: { message: string }) => {
    setErrorMsg(`Ingest failed: ${data.message}`);
    setTimeout(() => setErrorMsg(null), 8000);
  }, []));


  const graphData = {
    nodes,
    links: edges,
  };

  function nodeColor(node: ForceNode) {
    if (node.status === 'PENDING') return '#8B4513';
    const score = node.activityScore ?? 0.5;
    // Interpolate forest green (#2D5016) → terracotta (#8B4513) by activity score
    const r = Math.floor(0x2D + score * (0x8B - 0x2D));
    const g = Math.floor(0x50 + score * (0x45 - 0x50));
    const b = Math.floor(0x16 + score * (0x13 - 0x16));
    return `rgb(${r},${g},${b})`;
  }

  function nodeSize(node: ForceNode) {
    return 4 + (node.activityScore ?? 0.5) * 8;
  }

  function drawNode(node: ForceNode, ctx: CanvasRenderingContext2D) {
    const size = nodeSize(node);
    const x = node.x ?? 0;
    const y = node.y ?? 0;

    ctx.beginPath();
    if (node.status === 'PENDING') {
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = '#8B4513';
      ctx.lineWidth = 1.5;
      ctx.arc(x, y, size, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.arc(x, y, size, 0, 2 * Math.PI);
      ctx.fillStyle = nodeColor(node);
      ctx.fill();
    }

    ctx.font = `${Math.max(10, size * 1.2)}px sans-serif`;
    ctx.fillStyle = node.status === 'PENDING' ? '#9A7A60' : '#1C0F00';
    ctx.textAlign = 'center';
    ctx.fillText(node.title.length > 20 ? node.title.slice(0, 18) + '…' : node.title, x, y + size + 12);
  }

  function edgeColor(_edge: ForceLink) {
    return '#7A5840';
  }

  return (
    <div className="flex flex-col h-screen bg-earth-bg overflow-hidden">
      <NavBar pendingCount={pendingCount} onIngest={() => setIngestOpen(true)} />

      <div className="flex-1 relative graph-container">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-earth-muted">Loading graph…</div>
          </div>
        ) : (
          <ForceGraph2D
            ref={graphRef as any}
            graphData={graphData}
            nodeId="id"
            linkSource="source"
            linkTarget="target"
            nodeCanvasObject={drawNode as any}
            nodeCanvasObjectMode={() => 'replace'}
            linkWidth={(link) => ((link as ForceLink).weight ?? 0.5) * 4}
            linkColor={(link) => edgeColor(link as ForceLink)}
            linkLineDash={(link) => (link as ForceLink).status === 'PENDING' ? [4, 4] : null}
            onNodeClick={(node) => setSelectedNodeId((node as ForceNode).id)}
            backgroundColor="#FBF7F0"
            width={typeof window !== 'undefined' ? window.innerWidth : 1200}
            height={typeof window !== 'undefined' ? window.innerHeight - 56 : 800}
            d3ForceLink={(link: any) => link.distance(180).strength(0.5)}
            d3VelocityDecay={0.3}
          />
        )}

        <ActivityFeedWidget />

        {errorMsg && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-red-900/90 border border-red-500 text-red-200 text-sm px-4 py-2 rounded-lg shadow-lg z-50 max-w-md text-center">
            {errorMsg}
          </div>
        )}
      </div>

      {ingestOpen && (
        <IngestPanel
          onClose={() => setIngestOpen(false)}
          onIngested={() => { setIngestOpen(false); }}
        />
      )}

      {selectedNodeId && (
        <NodeDetailDrawer
          nodeId={selectedNodeId}
          onClose={() => setSelectedNodeId(null)}
          onNavigateToNode={setSelectedNodeId}
        />
      )}
    </div>
  );
}
