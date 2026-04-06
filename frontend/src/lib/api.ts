const BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('mg_token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> ?? {}),
  };

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  auth: {
    register: (email: string, password: string) =>
      request<{ token: string; user: { id: string; email: string } }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    login: (email: string, password: string) =>
      request<{ token: string; user: { id: string; email: string } }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    me: () => request<{ id: string; email: string; createdAt: string }>('/auth/me'),
  },

  graph: {
    get: () => request<{ nodes: import('../types').GraphNode[]; edges: import('../types').GraphEdge[] }>('/graph'),
    delta: (since: string) =>
      request<{ nodes: import('../types').GraphNode[]; edges: import('../types').GraphEdge[]; asOf: string }>(`/graph/delta?since=${encodeURIComponent(since)}`),
  },

  sources: {
    ingest: (data: FormData | { type: string; url?: string; text?: string; intentSignal?: string }) => {
      if (data instanceof FormData) {
        return request<{ sourceId: string; message: string }>('/sources/ingest', { method: 'POST', body: data });
      }
      return request<{ sourceId: string; message: string }>('/sources/ingest', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    list: () => request<import('../types').AgentSession[]>('/sources'),
    get: (id: string) => request<any>(`/sources/${id}`),
  },

  nodes: {
    get: (id: string) => request<import('../types').NodeDetail>(`/nodes/${id}`),
    update: (id: string, data: Partial<{ title: string; content: string; tags: string[]; domainBucket: string }>) =>
      request(`/nodes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    archive: (id: string) => request(`/nodes/${id}`, { method: 'DELETE' }),
    feedback: (id: string, action: import('../types').NodeFeedbackAction, extra?: { newTitle?: string; mergedIntoNodeId?: string }) =>
      request<{ ok: boolean }>(`/nodes/${id}/feedback`, { method: 'POST', body: JSON.stringify({ action, ...extra }) }),
  },

  edges: {
    create: (data: { fromNodeId: string; toNodeId: string; type: string; sourceCitation: string; weight?: number }) =>
      request('/edges', { method: 'POST', body: JSON.stringify(data) }),
    updateWeight: (id: string, weight: number) =>
      request(`/edges/${id}/weight`, { method: 'PATCH', body: JSON.stringify({ weight }) }),
    feedback: (id: string, reason: import('../types').EdgeFeedbackReason) =>
      request<{ ok: boolean }>(`/edges/${id}/feedback`, { method: 'POST', body: JSON.stringify({ reason }) }),
  },

  review: {
    pending: () => request<{ nodes: import('../types').PendingNode[]; edges: import('../types').PendingEdge[] }>('/review/pending'),
    commit: (nodeIds: string[], edgeIds: string[]) =>
      request('/review/commit', { method: 'POST', body: JSON.stringify({ nodeIds, edgeIds }) }),
    reject: (nodeIds: string[], edgeIds: string[], reasons?: { nodeReason?: string; edgeReason?: string }) =>
      request('/review/reject', { method: 'POST', body: JSON.stringify({ nodeIds, edgeIds, ...reasons }) }),
  },

  agent: {
    query: (question: string) =>
      request<import('../types').QueryResult>('/agent/query', { method: 'POST', body: JSON.stringify({ question }) }),
    lint: () => request<import('../types').HealthReport>('/agent/lint', { method: 'POST' }),
    correctionSynthesis: () => request<{ rules: string[] }>('/agent/correction-synthesis', { method: 'POST' }),
    sessions: () => request<import('../types').AgentSession[]>('/agent/sessions'),
  },

  profile: {
    corrections: () => request<import('../types').CorrectionProfile>('/profile/corrections'),
    updateCorrections: (rules: string[]) =>
      request<import('../types').CorrectionProfile>('/profile/corrections', { method: 'PATCH', body: JSON.stringify({ rules }) }),
  },
};
