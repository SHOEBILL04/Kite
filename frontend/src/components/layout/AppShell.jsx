import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  FileSearch,
  GitCompare,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  Radar,
  Scale,
  Sun,
} from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { initials } from '../../lib/format.js';
import { ROLE_LABELS } from '../../api/contract.js';
import { USE_MOCK } from '../../api/client.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useTheme } from '../../hooks/useTheme.js';
import { ApiStatus, Badge, Button } from '../ui/index.js';

export const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', title: 'Dashboard', icon: LayoutDashboard },
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
          'focus-ring group flex h-10 items-center gap-3 rounded-[8px] px-3 py-2 text-[14px] font-medium transition-colors',
          isActive
            ? 'bg-subtle text-primary border-l-[3px] border-l-green-500 font-semibold'
            : 'text-secondary hover:bg-hover hover:text-primary'
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn('h-[18px] w-[18px] shrink-0', isActive ? 'text-green-500' : 'text-muted')}
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
      <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-subtle text-primary text-[11px] font-semibold border border-border-default">
        {initials(user.name)}
      </span>
      <div className="hidden leading-tight sm:block min-w-0">
        <div className="truncate text-[13px] font-semibold text-primary">{user.name}</div>
        <div className="truncate text-[11px] text-muted">{user.department}</div>
      </div>
    </div>
  );
}

export function SegmentedThemeToggle({ className }) {
  const { theme, setTheme } = useTheme();

  const options = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'system', label: 'System', icon: Monitor },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Theme selector"
      className={cn(
        'flex h-[28px] items-center rounded-[6px] bg-subtle p-0.5 border border-border-default',
        className
      )}
    >
      {options.map((opt) => {
        const Icon = opt.icon;
        const isActive = theme === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            title={opt.label}
            onClick={() => setTheme(opt.id)}
            className={cn(
              'flex h-full flex-1 items-center justify-center rounded-[4px] px-1.5 transition-all text-xs cursor-pointer',
              isActive
                ? 'bg-surface text-primary shadow-elevation font-semibold'
                : 'text-muted hover:text-primary'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            <span className="sr-only">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function CompactThemeToggle({ className }) {
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

  return (
    <button
      type="button"
      onClick={cycleTheme}
      title={`Theme: ${theme}`}
      aria-label={`Current theme: ${theme}. Click to switch theme.`}
      className={cn(
        'focus-ring flex h-9 w-9 items-center justify-center rounded-[6px] border border-border-default bg-surface text-secondary hover:bg-hover hover:text-primary transition-colors cursor-pointer',
        className
      )}
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} />
    </button>
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
      <aside className="fixed inset-y-0 left-0 z-20 flex w-[240px] flex-col border-r border-border-default bg-surface">
        <div className="flex h-[56px] items-center gap-2.5 border-b border-border-default px-5">
          <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-action-primary text-action-text text-[13px] font-bold">
            CF
          </span>
          <div className="leading-tight">
            <div className="text-[18px] font-semibold tracking-tight text-heading">
              CogniFaculty
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">Academic Audit</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV_ITEMS.map((item) => (
            <SidebarLink key={item.to} item={item} />
          ))}
        </nav>

        <div className="space-y-3 border-t border-border-default p-4">
          <SegmentedThemeToggle />

          <div className="flex items-center justify-between text-[11px] text-muted">
            <span>v0.1.0</span>
            {USE_MOCK ? <Badge variant="warning">MOCK DATA</Badge> : null}
          </div>
        </div>
      </aside>

      {/* Top bar (56px high) */}
      <header className="fixed inset-x-0 left-[240px] top-0 z-10 flex h-[56px] items-center justify-between gap-4 border-b border-border-default bg-surface px-6 backdrop-blur">
        <div className="min-w-0">
          <h1 className="truncate text-[20px] font-semibold tracking-tight text-heading">
            {active?.title ?? 'CogniFaculty'}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <ApiStatus />
          {user ? <Badge variant="info">{ROLE_LABELS[user.role] ?? user.role}</Badge> : null}
          <UserChip user={user} />
          <CompactThemeToggle className="hidden sm:flex" />
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

      {/* Page Content */}
      <main className="ml-[240px] pt-[56px]">
        <div className="mx-auto max-w-[1440px] p-6 space-y-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
