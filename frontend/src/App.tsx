import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthContext, AuthUser } from './lib/auth';
import { connectSocket, disconnectSocket } from './lib/socket';
import LoginPage from './views/LoginPage';
import GraphPage from './views/GraphPage';
import ReviewPage from './views/ReviewPage';
import ActivityFeedPage from './views/ActivityFeedPage';
import CorrectionProfilePage from './views/CorrectionProfilePage';
import HealthReportPage from './views/HealthReportPage';

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem('mg_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('mg_token'));

  useEffect(() => {
    if (token) connectSocket(token);
    return () => { disconnectSocket(); };
  }, [token]);

  const login = useCallback((t: string, u: AuthUser) => {
    localStorage.setItem('mg_token', t);
    localStorage.setItem('mg_user', JSON.stringify(u));
    setToken(t);
    setUser(u);
    connectSocket(t);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('mg_token');
    localStorage.removeItem('mg_user');
    setToken(null);
    setUser(null);
    disconnectSocket();
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/" replace />} />
          <Route path="/" element={user ? <GraphPage /> : <Navigate to="/login" replace />} />
          <Route path="/review" element={user ? <ReviewPage /> : <Navigate to="/login" replace />} />
          <Route path="/activity" element={user ? <ActivityFeedPage /> : <Navigate to="/login" replace />} />
          <Route path="/profile" element={user ? <CorrectionProfilePage /> : <Navigate to="/login" replace />} />
          <Route path="/health" element={user ? <HealthReportPage /> : <Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
