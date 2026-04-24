import { useState, useRef } from 'react';
import { X, Link2, FileText, Upload } from 'lucide-react';
import { api } from '../lib/api';

interface IngestPanelProps {
  onClose: () => void;
  onIngested: (sourceId: string) => void;
}

type Tab = 'url' | 'file';

export default function IngestPanel({ onClose, onIngested }: IngestPanelProps) {
  const [tab, setTab] = useState<Tab>('url');
  const [url, setUrl] = useState('');
  const [intentSignal, setIntentSignal] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let res;
      if (tab === 'url') {
        res = await api.sources.ingest({ type: 'URL', url, intentSignal: intentSignal || undefined });
      } else if (tab === 'file' && file) {
        const fd = new FormData();
        fd.append('type', file.name.endsWith('.pdf') ? 'PDF' : 'TEXT');
        fd.append('file', file);
        if (intentSignal) fd.append('intentSignal', intentSignal);
        res = await api.sources.ingest(fd);
      } else {
        setError('No content provided');
        return;
      }
      onIngested(res.sourceId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'url', label: 'URL', icon: <Link2 className="w-4 h-4" /> },
    { id: 'file', label: 'File', icon: <FileText className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
      <div className="bg-[#F0E5D0] border border-[#C8A882] rounded-2xl w-full max-w-lg shadow-2xl pointer-events-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-earth-border">
          <h2 className="text-lg font-semibold text-earth-text">Add to Graph</h2>
          <button onClick={onClose} className="text-earth-muted hover:text-earth-text transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-1 p-4 pb-0">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm transition-colors ${
                tab === t.id ? 'bg-brand-500 text-white' : 'text-earth-muted hover:text-earth-text hover:bg-earth-input'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {tab === 'url' && (
            <input
              type="url"
              placeholder="https://…"
              value={url}
              onChange={e => setUrl(e.target.value)}
              required
              className="w-full bg-earth-input border border-earth-border rounded-lg px-4 py-2.5 text-earth-text placeholder-earth-faint focus:outline-none focus:border-brand-500"
            />
          )}

          {tab === 'file' && (
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-earth-border rounded-lg p-8 text-center cursor-pointer hover:border-brand-500 transition-colors"
            >
              <Upload className="w-8 h-8 text-earth-faint mx-auto mb-2" />
              {file ? (
                <p className="text-earth-text">{file.name}</p>
              ) : (
                <>
                  <p className="text-earth-muted">Drop a PDF or .txt file</p>
                  <p className="text-earth-faint text-sm mt-1">or click to browse</p>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.txt"
                className="hidden"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          )}

          <div>
            <label className="text-xs text-earth-faint mb-1 block">I'm adding this because… (optional)</label>
            <input
              type="text"
              placeholder="e.g. I want to understand how attention mechanisms work"
              value={intentSignal}
              onChange={e => setIntentSignal(e.target.value)}
              className="w-full bg-earth-input border border-earth-border rounded-lg px-4 py-2.5 text-earth-text placeholder-earth-faint focus:outline-none focus:border-brand-500 text-sm"
            />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors"
          >
            {loading ? 'Processing…' : 'Ingest'}
          </button>
        </form>
      </div>
    </div>
  );
}
