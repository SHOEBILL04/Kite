import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  FileSearch,
  GitCompare,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Radar,
  Scale,
  Shield,
  Upload,
} from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { initials } from '../../lib/format.js';
import { ROLE_LABELS } from '../../api/contract.js';
import { USE_MOCK } from '../../api/client.js';
import { useAuth } from '../../hooks/useAuth.js';
import { ApiStatus, Badge, Button } from '../ui/index.js';

export const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', title: 'Faculty Dashboard', icon: LayoutDashboard },
  { to: '/grading-batches', label: 'Mark Collection', title: 'Mark Collection', icon: Upload },
  { to: '/grading-parity', label: 'Grading Parity', title: 'Grading Parity & Section Audit', icon: Scale },
  { to: '/exam-moderation', label: 'Exam Moderation', title: 'Exam Paper Moderation & Bloom Audit', icon: FileSearch },
  {
    to: '/curriculum-harmonizer',
    label: 'Curriculum',
    title: 'Curriculum Harmonizer & Catalog Audit',
    icon: GitCompare,
  },
  { to: '/student-radar', label: 'Student Radar', title: 'Academic Vulnerability Radar', icon: Radar },
];

function SidebarLink({ item }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          'focus-ring group flex h-10 items-center gap-3 rounded-[8px] px-3 py-2 text-[14px] font-medium transition-colors',
          isActive
            ? 'bg-subtle text-heading border-l-[3px] border-l-action-primary font-semibold shadow-xs'
            : 'text-secondary hover:bg-hover hover:text-heading'
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn('h-[18px] w-[18px] shrink-0', isActive ? 'text-action-primary' : 'text-muted')}
            strokeWidth={isActive ? 2 : 1.75}
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
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-subtle text-action-primary text-[12px] font-semibold border border-border-strong">
        {initials(user.name)}
      </span>
      <div className="hidden leading-tight sm:block min-w-0">
        <div className="truncate text-[13px] font-semibold text-heading">{user.name}</div>
        <div className="truncate text-[11px] text-muted">{user.department}</div>
      </div>
    </div>
  );
}

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
    <div className="min-h-screen bg-canvas text-primary">
      {/* Sidebar (240px wide) */}
      <aside className="fixed inset-y-0 left-0 z-20 flex w-[240px] flex-col border-r border-border-default bg-surface shadow-xs">
        {/* University Portal Brand Header */}
        <div className="flex h-[56px] items-center gap-2.5 border-b border-border-default px-4 bg-surface">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-action-primary text-action-primary-text shadow-sm">
            <GraduationCap className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="leading-tight">
            <div className="text-[16px] font-bold tracking-tight text-heading">
              CogniFaculty
            </div>
            <div className="text-[9px] font-bold uppercase tracking-wider text-muted">
              Academic Affairs & Audit
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
            Academic Modules
          </div>
          {NAV_ITEMS.map((item) => (
            <SidebarLink key={item.to} item={item} />
          ))}
        </nav>

        {/* Institutional Footer */}
        <div className="border-t border-border-default p-3.5 bg-subtle/50">
          <div className="flex items-center justify-between text-[11px] text-muted font-medium">
            <span className="flex items-center gap-1.5">
              <Shield className="h-3 w-3 text-action-primary" />
              Faculty Portal
            </span>
            <span className="font-mono text-[10px]">v1.0</span>
          </div>
          {USE_MOCK ? (
            <div className="mt-1.5">
              <Badge variant="warning">MOCK REPOSITORY</Badge>
            </div>
          ) : null}
        </div>
      </aside>

      {/* Top bar (56px high) */}
      <header className="fixed inset-x-0 left-[240px] top-0 z-10 flex h-[56px] items-center justify-between gap-4 border-b border-border-default bg-surface/95 px-6 backdrop-blur shadow-xs">
        <div className="min-w-0 flex items-center gap-2">
          <span className="text-xs font-medium text-muted hidden sm:inline">Faculty Affairs /</span>
          <h1 className="truncate text-[17px] font-bold tracking-tight text-heading">
            {active?.title ?? 'CogniFaculty'}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <ApiStatus />
          {user ? (
            <Badge variant="info" className="font-medium">
              {ROLE_LABELS[user.role] ?? user.role}
            </Badge>
          ) : null}
          <UserChip user={user} />
          <Button
            variant="ghost"
            size="sm"
            icon={LogOut}
            loading={loggingOut}
            onClick={handleLogout}
            className="text-secondary hover:text-heading"
          >
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>

      {/* Page Content */}
      <main className="ml-[240px] pt-[56px]">
        <div className="mx-auto max-w-[1440px] p-6 space-y-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
