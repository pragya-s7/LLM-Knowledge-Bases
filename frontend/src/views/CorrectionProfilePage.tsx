import { useState, useEffect } from 'react';
import { Trash2, RefreshCw, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { CorrectionProfile } from '../types';
import NavBar from '../components/NavBar';

export default function CorrectionProfilePage() {
  const [profile, setProfile] = useState<CorrectionProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [synthesizing, setSynthesizing] = useState(false);
  const [editingRules, setEditingRules] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    api.profile.corrections().then(p => {
      setProfile(p);
      setEditingRules(p.rules);
      setLoading(false);
    }).catch(console.error);
  }, []);

  async function runSynthesis() {
    setSynthesizing(true);
    try {
      const result = await api.agent.correctionSynthesis();
      setProfile(prev => prev ? { ...prev, rules: result.rules } : null);
      setEditingRules(result.rules);
    } finally {
      setSynthesizing(false);
    }
  }

  async function saveRules() {
    const updated = await api.profile.updateCorrections(editingRules);
    setProfile(updated);
    setEditing(false);
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      <NavBar />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Correction Profile</h1>
              <p className="text-gray-400 text-sm mt-1">
                Rules Claude follows when processing your sources — derived from your corrections.
              </p>
              {profile?.generatedAt && (
                <p className="text-gray-600 text-xs mt-1">
                  Version {profile.version} · Updated {new Date(profile.generatedAt).toLocaleDateString()}
                </p>
              )}
            </div>
            <button
              onClick={runSynthesis}
              disabled={synthesizing}
              className="flex items-center gap-1.5 text-sm bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${synthesizing ? 'animate-spin' : ''}`} />
              Re-synthesize
            </button>
          </div>

          {loading ? (
            <div className="text-gray-400 text-center py-16">Loading…</div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              {editingRules.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">
                  No rules yet. Make some corrections in the Review Queue, then click Re-synthesize.
                </p>
              ) : (
                <div className="space-y-2 mb-4">
                  {editingRules.map((rule, i) => (
                    <div key={i} className="flex items-start gap-3 group">
                      <span className="text-gray-600 text-sm w-5 flex-shrink-0 mt-0.5">{i + 1}.</span>
                      {editing ? (
                        <input
                          value={rule}
                          onChange={e => {
                            const next = [...editingRules];
                            next[i] = e.target.value;
                            setEditingRules(next);
                          }}
                          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-brand-500"
                        />
                      ) : (
                        <p className="flex-1 text-gray-300 text-sm leading-relaxed">{rule}</p>
                      )}
                      {editing && (
                        <button
                          onClick={() => setEditingRules(prev => prev.filter((_, j) => j !== i))}
                          className="text-gray-600 hover:text-red-400 flex-shrink-0 mt-0.5 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {editing && (
                <button
                  onClick={() => setEditingRules(prev => [...prev, ''])}
                  className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-4 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add rule
                </button>
              )}

              <div className="flex gap-2 pt-2 border-t border-gray-800">
                {editing ? (
                  <>
                    <button onClick={saveRules} className="text-sm bg-brand-500 hover:bg-brand-600 text-white px-3 py-1.5 rounded-lg transition-colors">
                      Save
                    </button>
                    <button onClick={() => { setEditing(false); setEditingRules(profile?.rules ?? []); }} className="text-sm text-gray-400 hover:text-white px-3 py-1.5 rounded-lg transition-colors">
                      Cancel
                    </button>
                  </>
                ) : (
                  <button onClick={() => setEditing(true)} className="text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors">
                    Edit rules
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
