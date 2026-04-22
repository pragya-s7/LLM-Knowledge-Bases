import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { AgentSession } from '../types';
import NavBar from '../components/NavBar';

const TRIGGER_LABELS: Record<string, string> = {
  INGEST: 'Ingest',
  QUERY: 'Query',
  LINT: 'Health Check',
  CORRECTION_SYNTHESIS: 'Correction Synthesis',
};

export default function ActivityFeedPage() {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.agent.sessions().then(s => { setSessions(s); setLoading(false); }).catch(console.error);
    const interval = setInterval(() => {
      api.agent.sessions().then(setSessions).catch(console.error);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      <NavBar />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <h1 className="text-2xl font-bold text-white mb-6">Activity Feed</h1>

          {loading ? (
            <div className="text-gray-400 text-center py-16">Loading…</div>
          ) : sessions.length === 0 ? (
            <div className="text-gray-500 text-center py-16">No agent sessions yet. Ingest a source to start.</div>
          ) : (
            <div className="space-y-3">
              {sessions.map(session => (
                <div key={session.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          session.trigger === 'INGEST' ? 'bg-brand-500/20 text-brand-400' :
                          session.trigger === 'QUERY' ? 'bg-purple-900/50 text-purple-400' :
                          session.trigger === 'LINT' ? 'bg-yellow-900/50 text-yellow-400' :
                          'bg-gray-800 text-gray-400'
                        }`}>
                          {TRIGGER_LABELS[session.trigger]}
                        </span>
                        {session.source?.url && (
                          <a href={session.source.url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-gray-500 hover:text-gray-300 truncate max-w-xs">
                            {session.source.url}
                          </a>
                        )}
                      </div>
                      <div className="flex gap-4 text-sm">
                        {session.nodesCreated > 0 && <span className="text-green-400">+{session.nodesCreated} nodes</span>}
                        {session.edgesCreated > 0 && <span className="text-blue-400">+{session.edgesCreated} edges</span>}
                        {session.edgesStrengthened > 0 && <span className="text-yellow-400">~{session.edgesStrengthened} strengthened</span>}
                        {session.nodesRejected > 0 && <span className="text-red-400">-{session.nodesRejected} rejected</span>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs text-gray-500">
                        {new Date(session.createdAt).toLocaleDateString()} {new Date(session.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      {session.completedAt && (
                        <div className="text-xs text-gray-600">
                          {session.inputTokens + session.outputTokens} tokens
                        </div>
                      )}
                      {!session.completedAt && (
                        <span className="text-xs text-yellow-400">In progress…</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
