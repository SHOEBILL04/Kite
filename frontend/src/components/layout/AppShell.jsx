import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  FileSearch,
  GitCompare,
  LayoutDashboard,
  LogOut,
  Radar,
  Scale,
  Upload,
} from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { initials } from '../../lib/format.js';
import { ROLE_LABELS } from '../../api/contract.js';
import { USE_MOCK } from '../../api/client.js';
import { useAuth } from '../../hooks/useAuth.js';
import { ApiStatus, Badge, Button } from '../ui/index.js';

/**
 * Sidebar navigation. Feature devs: add nothing here — the five modules are
 * fixed. `title` is what the top bar renders for that route.
 */
export const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', title: 'Dashboard', icon: LayoutDashboard },
  { to: '/grading-batches', label: 'Mark Collection', title: 'Mark Collection', icon: Upload },
  { to: '/grading-parity', label: 'Grading Parity', title: 'Grading Parity Audit', icon: Scale },
  { to: '/exam-moderation', label: 'Exam Moderation', title: 'Exam Moderation', icon: FileSearch },
  {
    to: '/curriculum-harmonizer',
    label: 'Curriculum',
    title: 'Curriculum Harmonizer',
    icon: GitCompare,
  },
  { to: '/student-radar', label: 'Student Radar', title: 'Student Radar', icon: Radar },
];

function SidebarLink({ item }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          'focus-ring group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors',
          isActive
            ? 'bg-slate-800/80 text-amber-400'
            : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn('h-4 w-4 shrink-0', isActive ? 'text-amber-400' : 'text-slate-500')}
            strokeWidth={1.75}
          />
          <span className="truncate">{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

function UserChip({ user }) {
  if (!user) return null;
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-[11px] font-semibold text-amber-400">
        {initials(user.name)}
      </span>
      <div className="hidden leading-tight sm:block">
        <div className="text-[13px] font-medium text-slate-200">{user.name}</div>
        <div className="text-[11px] text-slate-500">{user.department}</div>
      </div>
    </div>
  );
}

/**
 * Application chrome: fixed sidebar, top bar, and the routed page below it.
 * Feature pages render into the `<Outlet />` and own nothing above it —
 * the page title comes from `NAV_ITEMS`.
 */
export default function AppShell() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [loggingOut, setLoggingOut] = useState(false);

  const active = NAV_ITEMS.find((item) => pathname.startsWith(item.to));

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 flex w-56 flex-col border-r border-slate-800 bg-slate-900">
        <div className="flex h-14 items-center gap-2.5 border-b border-slate-800 px-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-400 text-[13px] font-bold text-slate-950">
            CF
          </span>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold tracking-tight text-slate-100">
              CogniFaculty
            </div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Academic Audit</div>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {NAV_ITEMS.map((item) => (
            <SidebarLink key={item.to} item={item} />
          ))}
        </nav>

        <div className="border-t border-slate-800 px-3 py-2.5">
          <div className="flex items-center justify-between text-[11px] text-slate-600">
            <span>v0.1.0</span>
            {USE_MOCK ? <Badge variant="warning">MOCK DATA</Badge> : null}
          </div>
        </div>
      </aside>

      {/* Top bar */}
      <header className="fixed inset-x-0 left-56 top-0 z-10 flex h-14 items-center justify-between gap-4 border-b border-slate-800 bg-slate-950/90 px-5 backdrop-blur">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold tracking-tight text-slate-100">
            {active?.title ?? 'CogniFaculty'}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <ApiStatus />
          {user ? <Badge>{ROLE_LABELS[user.role] ?? user.role}</Badge> : null}
          <UserChip user={user} />
          <Button
            variant="ghost"
            size="sm"
            icon={LogOut}
            loading={loggingOut}
            onClick={handleLogout}
          >
            <span className="hidden sm:inline">Log out</span>
          </Button>
        </div>
      </header>

      {/* Page */}
      <main className="ml-56 pt-14">
        <div className="mx-auto max-w-[1600px] p-5">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
