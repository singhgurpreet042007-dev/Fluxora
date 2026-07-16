import { useState, type ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { useOrg } from '../lib/org';
import { useToast } from '../lib/toast';
import { Avatar } from './Avatar';
import { ChatDrawer } from './ChatDrawer';
import {
  LayoutDashboard, FolderKanban, CheckSquare, Users, Activity,
  Bell, LogOut, Menu, X, Zap, ChevronDown, Plus, Settings, MessageSquare,
} from 'lucide-react';

export type Page = 'dashboard' | 'projects' | 'tasks' | 'team' | 'activity' | 'settings';

interface LayoutProps {
  children: ReactNode;
  currentPage: Page;
  onNavigate: (page: Page) => void;
  notifications: { id: string; title: string; message: string; read: boolean; created_at: string }[];
  onMarkNotifRead: (id: string) => void;
}

export function DashboardLayout({ children, currentPage, onNavigate, notifications, onMarkNotifRead }: LayoutProps) {
  const { profile, signOut } = useAuth();
  const { orgs, currentOrg, membership, setCurrentOrg, createOrg } = useOrg();
  const { show } = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const navItems: { page: Page; label: string; icon: typeof LayoutDashboard }[] = [
    { page: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { page: 'projects', label: 'Projects', icon: FolderKanban },
    { page: 'tasks', label: 'My Tasks', icon: CheckSquare },
    { page: 'team', label: 'Team', icon: Users },
    { page: 'activity', label: 'Activity', icon: Activity },
    { page: 'settings', label: 'Settings', icon: Settings },
  ];

  const handleCreateOrg = async () => {
    if (!newOrgName.trim()) return;
    setCreatingOrg(true);
    const { error } = await createOrg(newOrgName);
    if (error) {
      show('error', 'Failed to create', error);
    } else {
      show('success', 'Organization created', `${newOrgName} is ready`);
      setNewOrgName('');
      setShowCreateOrg(false);
    }
    setCreatingOrg(false);
  };

  const handleSignOut = async () => {
    await signOut();
    show('info', 'Signed out', 'See you soon');
  };

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/5">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center glow-accent flex-shrink-0">
          <Zap className="text-white" size={22} fill="white" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-bold gradient-text font-display leading-none">Fluxora</h1>
          <p className="text-[10px] text-slate-500 mt-0.5">Work, in flow</p>
        </div>
      </div>

      {/* Org selector */}
      <div className="px-3 py-3 relative">
        <button
          onClick={() => setOrgMenuOpen(!orgMenuOpen)}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl glass hover:bg-surface-hover transition-smooth"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500/30 to-emerald-500/30 flex items-center justify-center text-teal-300 font-semibold text-sm flex-shrink-0">
            {(currentOrg?.name || '?')[0].toUpperCase()}
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-sm font-medium text-white truncate">{currentOrg?.name || 'No org'}</p>
            <p className="text-[10px] text-slate-500 capitalize">{membership?.role || 'member'}</p>
          </div>
          <ChevronDown className={`text-slate-400 transition-transform ${orgMenuOpen ? 'rotate-180' : ''}`} size={16} />
        </button>

        {orgMenuOpen && (
          <div className="absolute top-full left-3 right-3 mt-1 glass-strong rounded-xl shadow-2xl py-2 z-50 animate-scale-in">
            {orgs.map((org) => (
              <button
                key={org.id}
                onClick={() => { setCurrentOrg(org); setOrgMenuOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-smooth ${
                  currentOrg?.id === org.id ? 'bg-white/5' : ''
                }`}
              >
                <div className="w-6 h-6 rounded-md bg-gradient-to-br from-teal-500/30 to-emerald-500/30 flex items-center justify-center text-teal-300 font-semibold text-xs">
                  {org.name[0].toUpperCase()}
                </div>
                <span className="text-sm text-slate-200 truncate">{org.name}</span>
              </button>
            ))}
            <div className="border-t border-white/8 mt-1 pt-1">
              <button
                onClick={() => { setShowCreateOrg(true); setOrgMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-smooth text-teal-400"
              >
                <Plus size={16} />
                <span className="text-sm">New Organization</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = currentPage === item.page;
          return (
            <button
              key={item.page}
              onClick={() => { onNavigate(item.page); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-smooth group ${
                active
                  ? 'bg-gradient-to-r from-teal-500/15 to-emerald-500/5 text-teal-300 border border-teal-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon
                size={18}
                className={`transition-transform group-hover:scale-110 ${active ? 'text-teal-400' : ''}`}
              />
              <span className="text-sm font-medium">{item.label}</span>
              {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />}
            </button>
          );
        })}
      </nav>

      {/* User card */}
      <div className="p-3 border-t border-white/5 relative">
        <button
          onClick={() => setUserMenuOpen(!userMenuOpen)}
          className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5 transition-smooth"
        >
          <Avatar name={profile?.full_name} src={profile?.avatar_url} size="sm" />
          <div className="flex-1 text-left min-w-0">
            <p className="text-sm font-medium text-white truncate">{profile?.full_name || 'User'}</p>
            <p className="text-[10px] text-slate-500 truncate">View profile</p>
          </div>
          <ChevronDown className={`text-slate-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} size={14} />
        </button>

        {userMenuOpen && (
          <div className="absolute bottom-full left-3 right-3 mb-1 glass-strong rounded-xl shadow-2xl py-2 z-50 animate-scale-in">
            <button
              onClick={() => { onNavigate('settings'); setUserMenuOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-smooth text-slate-300 text-sm"
            >
              <Settings size={16} />
              Settings
            </button>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-smooth text-rose-400 text-sm"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex relative">
      <div className="aurora-bg opacity-30">
        <div className="aurora-blob" />
        <div className="aurora-blob" />
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 flex-col glass border-r border-white/5 relative z-10">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-64 flex flex-col glass-strong border-r border-white/10 animate-slide-in-right">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        {/* Top bar */}
        <header className="h-16 glass border-b border-white/5 flex items-center justify-between px-4 lg:px-6 gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-white/5 transition-smooth text-slate-400"
            >
              <Menu size={20} />
            </button>
            <h2 className="text-lg font-semibold font-display text-white capitalize hidden sm:block">
              {currentPage === 'tasks' ? 'My Tasks' : currentPage}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {/* Chat */}
            <button
              onClick={() => setChatOpen(true)}
              className="p-2.5 rounded-xl hover:bg-white/5 transition-smooth text-slate-400 hover:text-white"
              title="Team chat"
            >
              <MessageSquare size={18} />
            </button>

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative p-2.5 rounded-xl hover:bg-white/5 transition-smooth text-slate-400 hover:text-white"
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center animate-bounce-in">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-80 glass-strong rounded-2xl shadow-2xl z-50 animate-scale-in max-h-96 flex flex-col">
                    <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-white">Notifications</h3>
                      {unreadCount > 0 && (
                        <span className="text-xs text-teal-400">{unreadCount} unread</span>
                      )}
                    </div>
                    <div className="overflow-y-auto flex-1">
                      {notifications.length === 0 ? (
                        <div className="py-12 text-center text-slate-500 text-sm">
                          <Bell size={24} className="mx-auto mb-2 opacity-30" />
                          No notifications yet
                        </div>
                      ) : (
                        notifications.slice(0, 20).map((n) => (
                          <button
                            key={n.id}
                            onClick={() => onMarkNotifRead(n.id)}
                            className={`w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-smooth ${
                              !n.read ? 'bg-teal-500/5' : ''
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              {!n.read && <div className="w-2 h-2 rounded-full bg-teal-400 mt-1.5 flex-shrink-0" />}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white">{n.title}</p>
                                <p className="text-xs text-slate-400 mt-0.5">{n.message}</p>
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <Avatar name={profile?.full_name} src={profile?.avatar_url} size="sm" />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Create org modal */}
      {showCreateOrg && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fade-in">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateOrg(false)} />
          <div className="relative w-full max-w-md glass-strong rounded-2xl shadow-2xl p-6 animate-scale-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">New Organization</h3>
              <button onClick={() => setShowCreateOrg(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-4">
              Create a new workspace for your team. You'll be the admin.
            </p>
            <input
              type="text"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              placeholder="Acme Inc."
              className="input-field w-full rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 mb-4"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreateOrg()}
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowCreateOrg(false)} className="btn-ghost px-4 py-2 rounded-lg text-sm text-slate-300">
                Cancel
              </button>
              <button
                onClick={handleCreateOrg}
                disabled={creatingOrg || !newOrgName.trim()}
                className="btn-primary px-4 py-2 rounded-lg text-sm disabled:opacity-50"
              >
                {creatingOrg ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
      <ChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}