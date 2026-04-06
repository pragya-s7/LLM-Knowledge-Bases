import { useEffect } from 'react';
import { getSocket } from '../lib/socket';

type SocketEventMap = {
  'agent:start': { sessionId: string; sourceId: string };
  'agent:thinking': { message: string };
  'agent:complete': { sessionId: string; synthesisSummary: string; nodesCreated: number; edgesCreated: number; merged: number };
  'agent:error': { sessionId: string; message: string };
  'node:pending': { id: string; title: string; content: string; tags: string[]; activityScore: number; domainBucket: string | null; status: string; confidence: number; sourceId: string };
  'node:created': { id: string; title?: string };
  'edge:pending': { id: string; fromNodeId: string; toNodeId: string; type: string; weight: number; sourceCitation: string; confidence: number; status: string };
  'edge:created': { id: string };
  'edge:strengthened': { id: string; weight: number };
  'annotation:created': { nodeId: string };
};

export function useSocketEvent<K extends keyof SocketEventMap>(
  event: K,
  handler: (data: SocketEventMap[K]) => void
) {
  useEffect(() => {
    const socket = getSocket();
    socket.on(event as string, handler as any);
    return () => { socket.off(event as string, handler as any); };
  }, [event, handler]);
}
