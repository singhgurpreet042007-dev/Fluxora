import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../lib/auth';
import { useOrg } from '../lib/org';
import { supabase } from '../lib/supabase';
import { Avatar } from '../components/Avatar';
import { Spinner } from '../components/Loader';
import { formatRelativeTime, statusColor, priorityColor } from '../lib/utils';
import type { Task, Project, ActivityLog, UserProfile, OrgMember } from '../lib/types';
import {
  TrendingUp, CheckCircle2, Clock, ArrowUpRight,
  Target, Activity, AlertCircle,
} from 'lucide-react';

interface DashboardProps {
  onNavigate: (page: 'dashboard' | 'projects' | 'tasks' | 'team' | 'activity' | 'settings') => void;
}

export function DashboardPage({ onNavigate }: DashboardProps) {
  const { user, profile } = useAuth();
  const { currentOrg } = useOrg();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrg || !user) return;
    setLoading(true);

    (async () => {
      const [tasksRes, projectsRes, actsRes, memRes] = await Promise.all([
        supabase.from('tasks').select('*').eq('organization_id', currentOrg.id),
        supabase.from('projects').select('*').eq('organization_id', currentOrg.id),
        supabase.from('activity_logs').select('*').eq('organization_id', currentOrg.id).order('created_at', { ascending: false }).limit(10),
        supabase.from('organization_members').select('*').eq('organization_id', currentOrg.id),
      ]);

      setTasks((tasksRes.data as Task[]) || []);
      setProjects((projectsRes.data as Project[]) || []);
      setActivities((actsRes.data as ActivityLog[]) || []);
      setMembers((memRes.data as OrgMember[]) || []);

      if (memRes.data && memRes.data.length > 0) {
        const userIds = memRes.data.map((m) => m.user_id);
        const { data: profs } = await supabase.from('user_profiles').select('*').in('id', userIds);
        const profMap: Record<string, UserProfile> = {};
        (profs || []).forEach((p) => { profMap[p.id] = p as UserProfile; });
        setProfiles(profMap);
      }

      setLoading(false);
    })();
  }, [currentOrg, user]);

  // Real-time updates
  useEffect(() => {
    if (!currentOrg) return;
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `organization_id=eq.${currentOrg.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') setTasks((prev) => [payload.new as Task, ...prev]);
          if (payload.eventType === 'UPDATE') setTasks((prev) => prev.map((t) => t.id === (payload.new as Task).id ? payload.new as Task : t));
          if (payload.eventType === 'DELETE') setTasks((prev) => prev.filter((t) => t.id !== (payload.old as Task).id));
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_logs', filter: `organization_id=eq.${currentOrg.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') setActivities((prev) => [payload.new as ActivityLog, ...prev].slice(0, 10));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentOrg]);

  const stats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === 'done').length;
    const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
    const todo = tasks.filter((t) => t.status === 'todo').length;
    const urgent = tasks.filter((t) => t.priority === 'urgent' && t.status !== 'done').length;
    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, inProgress, todo, urgent, completionRate };
  }, [tasks]);

  const myTasks = useMemo(() => tasks.filter((t) => t.assignee_id === user?.id && t.status !== 'done').slice(0, 5), [tasks, user]);

  const statCards = [
    { label: 'Total Tasks', value: stats.total, icon: Target, color: 'text-teal-400', bg: 'bg-teal-500/10', glow: 'shadow-teal-500/20' },
    { label: 'Completed', value: stats.done, icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10', glow: 'shadow-emerald-500/20' },
    { label: 'In Progress', value: stats.inProgress, icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10', glow: 'shadow-amber-500/20' },
    { label: 'Urgent', value: stats.urgent, icon: AlertCircle, color: 'text-rose-400', bg: 'bg-rose-500/10', glow: 'shadow-rose-500/20' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Welcome header */}
      <div className="animate-fade-in-up">
        <h1 className="text-2xl lg:text-3xl font-bold text-white font-display">
          Welcome back, {profile?.full_name?.split(' ')[0] || 'there'}
        </h1>
        <p className="text-slate-400 mt-1">Here's what's happening in {currentOrg?.name} today.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {statCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className={`card-premium rounded-2xl p-4 lg:p-5 card-3d animate-fade-in-up stagger-${i + 1} relative overflow-hidden group`}
            >
              <div className={`absolute -right-4 -top-4 w-20 h-20 rounded-full ${card.bg} blur-2xl group-hover:scale-150 transition-transform duration-700`} />
              <div className="relative">
                <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center mb-3`}>
                  <Icon className={card.color} size={20} />
                </div>
                <p className="text-2xl lg:text-3xl font-bold text-white font-display">{card.value}</p>
                <p className="text-xs text-slate-400 mt-1">{card.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Completion ring + projects */}
        <div className="lg:col-span-1 space-y-4">
          {/* Completion progress */}
          <div className="card-premium rounded-2xl p-6 animate-fade-in-up stagger-3">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white">Completion Rate</h3>
              <TrendingUp className="text-teal-400" size={18} />
            </div>
            <div className="flex items-center justify-center py-4">
              <div className="relative w-40 h-40">
                <svg className="progress-ring w-full h-full" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                  <circle
                    cx="60" cy="60" r="52" fill="none" stroke="url(#grad)" strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 52}
                    strokeDashoffset={2 * Math.PI * 52 * (1 - stats.completionRate / 100)}
                    style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.22, 1, 0.36, 1)' }}
                  />
                  <defs>
                    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#14b8a6" />
                      <stop offset="100%" stopColor="#10b981" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold gradient-text font-display">{stats.completionRate}%</span>
                  <span className="text-xs text-slate-400 mt-1">{stats.done} of {stats.total}</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <div className="text-center">
                <p className="text-lg font-semibold text-slate-400">{stats.todo}</p>
                <p className="text-[10px] text-slate-500">To Do</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-amber-400">{stats.inProgress}</p>
                <p className="text-[10px] text-slate-500">Active</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-emerald-400">{stats.done}</p>
                <p className="text-[10px] text-slate-500">Done</p>
              </div>
            </div>
          </div>

          {/* Projects list */}
          <div className="card-premium rounded-2xl p-5 animate-fade-in-up stagger-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white">Projects</h3>
              <button onClick={() => onNavigate('projects')} className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1">
                View all <ArrowUpRight size={12} />
              </button>
            </div>
            {projects.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">No projects yet</p>
            ) : (
              <div className="space-y-2">
                {projects.slice(0, 5).map((p) => {
                  const projTasks = tasks.filter((t) => t.project_id === p.id);
                  const pDone = projTasks.filter((t) => t.status === 'done').length;
                  const pProgress = projTasks.length > 0 ? Math.round((pDone / projTasks.length) * 100) : 0;
                  return (
                    <div key={p.id} className="group cursor-pointer" onClick={() => onNavigate('projects')}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
                          <span className="text-sm text-slate-200 truncate">{p.name}</span>
                        </div>
                        <span className="text-xs text-slate-500 flex-shrink-0">{pProgress}%</span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-1000"
                          style={{ width: `${pProgress}%`, background: p.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* My tasks + activity */}
        <div className="lg:col-span-2 space-y-4">
          {/* My tasks */}
          <div className="card-premium rounded-2xl p-5 animate-fade-in-up stagger-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white">My Tasks</h3>
              <button onClick={() => onNavigate('tasks')} className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1">
                View all <ArrowUpRight size={12} />
              </button>
            </div>
            {myTasks.length === 0 ? (
              <div className="py-8 text-center text-slate-500">
                <CheckCircle2 size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No pending tasks. You're all caught up!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {myTasks.map((task) => {
                  const sCol = statusColor(task.status);
                  const pCol = priorityColor(task.priority);
                  const proj = projects.find((p) => p.id === task.project_id);
                  return (
                    <div key={task.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-smooth group cursor-pointer">
                      <span className={pCol.dot + ' status-dot'} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate group-hover:text-teal-300 transition-smooth">{task.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {proj && <span className="text-[10px] text-slate-500 truncate">{proj.name}</span>}
                          {task.due_date && (
                            <span className="text-[10px] text-slate-500">
                              • due {new Date(task.due_date).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${sCol.bg} ${sCol.text} flex-shrink-0 capitalize`}>
                        {task.status.replace('_', ' ')}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Activity feed */}
          <div className="card-premium rounded-2xl p-5 animate-fade-in-up stagger-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Activity className="text-teal-400" size={18} />
                Recent Activity
              </h3>
              <button onClick={() => onNavigate('activity')} className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1">
                View all <ArrowUpRight size={12} />
              </button>
            </div>
            {activities.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">No recent activity</p>
            ) : (
              <div className="space-y-1">
                {activities.slice(0, 6).map((act) => {
                  const prof = profiles[act.user_id];
                  return (
                    <div key={act.id} className="flex items-start gap-3 py-2 px-2 rounded-lg hover:bg-white/5 transition-smooth">
                      <Avatar name={prof?.full_name} src={prof?.avatar_url} size="xs" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-300">
                          <span className="text-white font-medium">{prof?.full_name || 'Someone'}</span>{' '}
                          <span className="text-slate-400">{act.action}</span>{' '}
                          <span className="text-slate-300">{act.entity_type}</span>
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{formatRelativeTime(act.created_at)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Team preview */}
          <div className="card-premium rounded-2xl p-5 animate-fade-in-up stagger-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white">Team</h3>
              <button onClick={() => onNavigate('team')} className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1">
                Manage <ArrowUpRight size={12} />
              </button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {members.slice(0, 8).map((m) => {
                const prof = profiles[m.user_id];
                return (
                  <div key={m.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5">
                    <Avatar name={prof?.full_name} src={prof?.avatar_url} size="xs" />
                    <span className="text-sm text-slate-200">{prof?.full_name?.split(' ')[0] || 'Member'}</span>
                    {m.role === 'admin' && (
                      <span className="text-[9px] text-teal-400 bg-teal-500/10 px-1.5 py-0.5 rounded-full">admin</span>
                    )}
                  </div>
                );
              })}
              {members.length === 0 && <p className="text-sm text-slate-500">No team members</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}