import { Link, useLocation } from 'react-router-dom';
import { Plus, GitBranch, Shield, Activity } from 'lucide-react';
import { useAuth } from '../lib/auth';

interface NavBarProps {
  pendingCount?: number;
  onIngest?: () => void;
}

export default function NavBar({ pendingCount = 0, onIngest }: NavBarProps) {
  const { logout, user } = useAuth();
  const { pathname } = useLocation();

  return (
    <nav className="h-14 bg-[#6B4530] border-b border-[#3A2010] flex items-center px-4 gap-4 flex-shrink-0">
      <Link to="/" className="flex items-center gap-2 mr-4">
        <GitBranch className="w-5 h-5 text-brand-500" />
        <span className="font-semibold text-white">MindGraph</span>
      </Link>

      <div className="flex items-center gap-1 flex-1">
        <NavLink to="/" active={pathname === '/'} icon={<GitBranch className="w-4 h-4" />} label="Graph" />
        <NavLink to="/review" active={pathname === '/review'} icon={<Shield className="w-4 h-4" />} label="Review" />
        <NavLink to="/activity" active={pathname === '/activity'} icon={<Activity className="w-4 h-4" />} label="Activity" />
      </div>

      {onIngest && (
        <button
          onClick={onIngest}
          className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Ingest
        </button>
      )}

      <div className="text-white/60 text-sm">{user?.email}</div>
      <button onClick={logout} className="text-white/60 hover:text-white text-sm transition-colors">
        Sign out
      </button>
    </nav>
  );
}

function NavLink({ to, active, icon, label }: { to: string; active: boolean; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
        active ? 'bg-earth-body/40 text-white font-medium' : 'text-white/80 hover:text-white hover:bg-earth-body/30'
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}
