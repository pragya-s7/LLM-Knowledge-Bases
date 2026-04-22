import 'dotenv/config';
import { vi } from 'vitest';

// Mock embeddings so tests don't hit Ollama
vi.mock('../lib/embeddings', () => ({
  getEmbedding: vi.fn().mockResolvedValue(new Array(768).fill(0.1)),
  cosineSimilarity: vi.fn().mockReturnValue(0.5),
}));

// Mock ingest agent so tests don't trigger long-running LLM calls
vi.mock('../agents/ingestAgent', () => ({
  runIngestAgent: vi.fn().mockResolvedValue(undefined),
}));

// Mock URL/PDF fetching
vi.mock('../lib/ingest', () => ({
  fetchUrl: vi.fn().mockResolvedValue({ text: 'Test article content about machine learning.' }),
  extractPdfText: vi.fn().mockResolvedValue('Test PDF content.'),
  hashUrl: vi.fn().mockImplementation((url: string) => `hash-${url}`),
}));
