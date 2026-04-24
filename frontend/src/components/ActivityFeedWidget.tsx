import { useState, useCallback } from 'react';
import { useSocketEvent } from '../hooks/useSocket';

interface FeedEntry {
  id: string;
  message: string;
  time: Date;
  type: 'start' | 'complete' | 'error';
}

export default function ActivityFeedWidget() {
  const [entries, setEntries] = useState<FeedEntry[]>([]);

  const addEntry = useCallback((msg: string, type: FeedEntry['type']) => {
    const entry: FeedEntry = { id: crypto.randomUUID(), message: msg, time: new Date(), type };
    setEntries(prev => [entry, ...prev].slice(0, 10));
  }, []);

  useSocketEvent('agent:start', useCallback(() => {
    addEntry('Agent started processing…', 'start');
  }, [addEntry]));

  useSocketEvent('agent:complete', useCallback(({ nodesCreated, nodesPending, edgesCreated, edgesPending }: any) => {
    const nodePart = `${nodesCreated} node${nodesCreated !== 1 ? 's' : ''}`;
    const edgePart = `${edgesCreated} edge${edgesCreated !== 1 ? 's' : ''}`;
    const pendingTotal = (nodesPending ?? 0) + (edgesPending ?? 0);
    const pendingNote = pendingTotal > 0 ? ` (${pendingTotal} need review)` : '';
    addEntry(`Done — ${nodePart}, ${edgePart} added${pendingNote}`, 'complete');
  }, [addEntry]));

  useSocketEvent('agent:error', useCallback(({ message }) => {
    addEntry(`Ingest failed: ${message}`, 'error');
  }, [addEntry]));

  if (entries.length === 0) return null;

  return (
    <div className="absolute bottom-4 right-4 w-72 space-y-1.5 pointer-events-auto select-text">
      {entries.slice(0, 4).map(entry => (
        <div
          key={entry.id}
          className={`px-3 py-2 rounded-lg text-xs flex items-start gap-2 border shadow-md ${
            entry.type === 'error'    ? 'bg-red-50 text-red-800 border-red-200' :
            entry.type === 'complete' ? 'bg-brand-50 text-brand-700 border-brand-500/30' :
                                        'bg-earth-card text-earth-body border-earth-border'
          }`}
        >
          <span className="flex-1">{entry.message}</span>
          <span className="text-earth-faint flex-shrink-0">{entry.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      ))}
    </div>
  );
}
