import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { AgentSession } from '../types';
import NavBar from '../components/NavBar';

const TRIGGER_LABELS: Record<string, string> = {
  INGEST: 'Ingest',
  QUERY: 'Query',
};

const PAGE_SIZE = 10;

export default function ActivityFeedPage() {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.agent.sessions().then(s => { setSessions(s); setLoading(false); }).catch(console.error);
    const interval = setInterval(() => {
      api.agent.sessions().then(setSessions).catch(console.error);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-earth-bg">
      <NavBar />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <h1 className="text-2xl font-bold text-earth-text mb-6">Activity Feed</h1>

          {loading ? (
            <div className="text-earth-muted text-center py-16">Loading…</div>
          ) : sessions.length === 0 ? (
            <div className="text-earth-faint text-center py-16">No agent sessions yet. Ingest a source to start.</div>
          ) : (() => {
            const totalPages = Math.ceil(sessions.length / PAGE_SIZE);
            const paginated = sessions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
            return (
            <>
            <div className="space-y-3">
              {paginated.map(session => (
                <div key={session.id} className="bg-earth-card border border-earth-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          session.trigger === 'INGEST' ? 'bg-brand-500/15 text-brand-600' :
                                                         'bg-earth-input text-earth-muted'
                        }`}>
                          {TRIGGER_LABELS[session.trigger]}
                        </span>
                        {session.source?.url && (
                          <a href={session.source.url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-earth-muted hover:text-earth-text truncate max-w-xs">
                            {session.source.url}
                          </a>
                        )}
                      </div>
                      <div className="flex gap-4 text-sm">
                        {session.nodesCreated > 0 && <span className="text-green-700">+{session.nodesCreated} nodes</span>}
                        {session.edgesCreated > 0 && <span className="text-brand-500">+{session.edgesCreated} edges</span>}
                        {session.edgesStrengthened > 0 && <span className="text-earth-muted">~{session.edgesStrengthened} strengthened</span>}
                        {session.nodesRejected > 0 && <span className="text-red-600">-{session.nodesRejected} rejected</span>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs text-earth-muted">
                        {new Date(session.createdAt).toLocaleDateString()} {new Date(session.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      {session.completedAt && (
                        <div className="text-xs text-earth-faint">
                          {session.inputTokens + session.outputTokens} tokens
                        </div>
                      )}
                      {!session.completedAt && (
                        <span className="text-xs text-yellow-600">In progress…</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <button
                  onClick={() => setPage(p => p - 1)}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-sm rounded-lg border border-earth-border text-earth-muted hover:text-earth-text hover:bg-earth-input disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <span className="text-sm text-earth-muted">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 text-sm rounded-lg border border-earth-border text-earth-muted hover:text-earth-text hover:bg-earth-input disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            )}
            </>
          );
          })()}
        </div>
      </div>
    </div>
  );
}
