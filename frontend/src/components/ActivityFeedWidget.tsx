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

  useSocketEvent('agent:complete', useCallback(({ nodesCreated, edgesCreated }) => {
    addEntry(`Done — ${nodesCreated} nodes, ${edgesCreated} edges pending review`, 'complete');
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
          className={`px-3 py-2 rounded-lg text-xs flex items-start gap-2 ${
            entry.type === 'error' ? 'bg-red-900/80 text-red-200' :
            entry.type === 'complete' ? 'bg-green-900/80 text-green-200' :
            'bg-gray-900/90 text-gray-300'
          } border border-white/10 backdrop-blur-sm`}
        >
          <span className="flex-1">{entry.message}</span>
          <span className="text-gray-500 flex-shrink-0">{entry.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      ))}
    </div>
  );
}
