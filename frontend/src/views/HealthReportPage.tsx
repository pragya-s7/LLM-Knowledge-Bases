import { useState } from 'react';
import { AlertTriangle, Unlink, Search, Copy, BookOpen, Zap } from 'lucide-react';
import { api } from '../lib/api';
import { HealthReport } from '../types';
import NavBar from '../components/NavBar';

export default function HealthReportPage() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function runLint() {
    setLoading(true);
    setError('');
    try {
      const r = await api.agent.lint();
      setReport(r as HealthReport);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const total = report
    ? report.contradictions.length + report.orphans.length + report.gaps.length + report.probableDupes.length
    : 0;

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      <NavBar />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Graph Health</h1>
              <p className="text-gray-400 text-sm mt-1">Run a lint pass to find structural issues in your knowledge graph.</p>
            </div>
            <button
              onClick={runLint}
              disabled={loading}
              className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <Zap className="w-4 h-4" />
              {loading ? 'Analyzing…' : 'Run Health Check'}
            </button>
          </div>

          {error && <div className="bg-red-900/40 border border-red-800 text-red-300 rounded-xl p-4 mb-6">{error}</div>}

          {!report && !loading && (
            <div className="text-center py-20 text-gray-500">
              <Zap className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>Click "Run Health Check" to analyze your graph.</p>
            </div>
          )}

          {report && (
            <div className="space-y-6">
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Contradictions', count: report.contradictions.length, color: 'text-red-400', bg: 'bg-red-900/20' },
                  { label: 'Orphan Nodes', count: report.orphans.length, color: 'text-yellow-400', bg: 'bg-yellow-900/20' },
                  { label: 'Concept Gaps', count: report.gaps.length, color: 'text-blue-400', bg: 'bg-blue-900/20' },
                  { label: 'Probable Dupes', count: report.probableDupes.length, color: 'text-purple-400', bg: 'bg-purple-900/20' },
                ].map(item => (
                  <div key={item.label} className={`${item.bg} border border-white/5 rounded-xl p-4 text-center`}>
                    <div className={`text-2xl font-bold ${item.color}`}>{item.count}</div>
                    <div className="text-gray-400 text-xs mt-1">{item.label}</div>
                  </div>
                ))}
              </div>

              {report.contradictions.length > 0 && (
                <Section icon={<AlertTriangle className="w-4 h-4 text-red-400" />} title="Contradictions">
                  {report.contradictions.map((c, i) => (
                    <div key={i} className="bg-gray-900 border border-red-900/50 rounded-lg p-3 text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-white">{c.nodeATitle}</span>
                        <span className="text-red-400">⟷</span>
                        <span className="text-white">{c.nodeBTitle}</span>
                      </div>
                      <p className="text-gray-400 text-xs">{c.reason}</p>
                    </div>
                  ))}
                </Section>
              )}

              {report.orphans.length > 0 && (
                <Section icon={<Unlink className="w-4 h-4 text-yellow-400" />} title="Orphan Nodes">
                  <div className="flex flex-wrap gap-2">
                    {report.orphans.map((o, i) => (
                      <span key={i} className="bg-gray-900 border border-gray-700 text-gray-300 text-sm px-3 py-1.5 rounded-lg">
                        {o.title}
                      </span>
                    ))}
                  </div>
                </Section>
              )}

              {report.gaps.length > 0 && (
                <Section icon={<Search className="w-4 h-4 text-blue-400" />} title="Concept Gaps">
                  {report.gaps.map((g, i) => (
                    <div key={i} className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-sm">
                      <span className="text-white">{g.concept}</span>
                      <span className="text-gray-500 text-xs ml-2">mentioned in "{g.mentionedInNodeTitle}"</span>
                    </div>
                  ))}
                </Section>
              )}

              {report.probableDupes.length > 0 && (
                <Section icon={<Copy className="w-4 h-4 text-purple-400" />} title="Probable Duplicates">
                  {report.probableDupes.map((d, i) => (
                    <div key={i} className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-white">{d.nodeATitle}</span>
                        <span className="text-purple-400">≈</span>
                        <span className="text-white">{d.nodeBTitle}</span>
                      </div>
                      <p className="text-gray-400 text-xs">{d.reason}</p>
                    </div>
                  ))}
                </Section>
              )}

              {report.suggestedSources.length > 0 && (
                <Section icon={<BookOpen className="w-4 h-4 text-green-400" />} title="Suggested Reading">
                  {report.suggestedSources.map((s, i) => (
                    <div key={i} className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-sm">
                      <p className="text-white font-medium mb-0.5">{s.title}</p>
                      <p className="text-gray-400 text-xs">{s.reason}</p>
                    </div>
                  ))}
                </Section>
              )}

              {total === 0 && (
                <div className="text-center py-8 text-green-400">
                  Graph looks healthy! No issues found.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-3">
        {icon} {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
