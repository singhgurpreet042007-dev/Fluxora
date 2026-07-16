import { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { useOrg } from '../lib/org';
import { supabase } from '../lib/supabase';
import { Avatar } from '../components/Avatar';
import { Spinner } from '../components/Loader';
import { formatRelativeTime, formatLogAction } from '../lib/utils';
import type { ActivityLog, UserProfile } from '../lib/types';
import {
  Activity, Plus, Edit3, Trash2, CheckCircle2, UserPlus,
  CheckSquare, Filter,
} from 'lucide-react';

const ACTION_ICONS: Record<string, typeof Plus> = {
  created: Plus,
  updated: Edit3,
  deleted: Trash2,
  completed: CheckCircle2,
  status_changed: CheckSquare,
  assigned: UserPlus,
  joined: UserPlus,
  removed: Trash2,
};

export function ActivityPage() {
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    if (!currentOrg || !user) return;
    setLoading(true);

    (async () => {
      const { data: acts } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('organization_id', currentOrg.id)
        .order('created_at', { ascending: false })
        .limit(100);

      setActivities((acts as ActivityLog[]) || []);

      // Get unique user IDs
      const userIds = [...new Set((acts || []).map((a) => (a as ActivityLog).user_id))];
      if (userIds.length > 0) {
        const { data: profs } = await supabase.from('user_profiles').select('*').in('id', userIds);
        const profMap: Record<string, UserProfile> = {};
        (profs || []).forEach((p) => { profMap[p.id] = p as UserProfile; });
        setProfiles(profMap);
      }
      setLoading(false);
    })();
  }, [currentOrg, user]);

  // Real-time
  useEffect(() => {
    if (!currentOrg) return;
    const channel = supabase
      .channel('activity-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_logs', filter: `organization_id=eq.${currentOrg.id}` },
        (payload) => setActivities((prev) => [payload.new as ActivityLog, ...prev].slice(0, 100))
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentOrg]);

  const entityTypes = ['all', ...new Set(activities.map((a) => a.entity_type))];
  const filtered = filter === 'all' ? activities : activities.filter((a) => a.entity_type === filter);

  if (loading) {
    return <div className="flex items-center justify-center h-full min-h-[60vh]"><Spinner size={32} /></div>;
  }

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-bold text-white font-display flex items-center gap-2">
            <Activity className="text-amber-400" size={24} />
            Activity Log
          </h1>
          <p className="text-slate-400 text-sm mt-1">Real-time audit trail for {currentOrg?.name}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 mb-5 flex-wrap animate-fade-in-up stagger-1">
        <Filter size={14} className="text-slate-500" />
        {entityTypes.map((t) => (
          <button
            key={t} onClick={() => setFilter(t)}
            className={`px-3 py-1.5 rounded-lg text-xs capitalize transition-smooth ${
              filter === t ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'btn-ghost text-slate-400'
            }`}
          >
            {t === 'all' ? 'All' : t}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card-premium rounded-2xl p-12 text-center animate-fade-in-up stagger-2">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
            <Activity className="text-amber-400" size={32} />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No activity yet</h3>
          <p className="text-slate-400 text-sm">Actions across your workspace will appear here in real-time</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-5 top-0 bottom-0 w-px bg-gradient-to-b from-amber-500/30 via-white/8 to-transparent" />

          <div className="space-y-1">
            {filtered.map((act, i) => {
              const prof = profiles[act.user_id];
              const Icon = ACTION_ICONS[act.action] || Activity;
              return (
                <div
                  key={act.id}
                  className="relative flex items-start gap-4 p-3 rounded-xl hover:bg-white/5 transition-smooth animate-fade-in-up"
                  style={{ animationDelay: `${Math.min(i * 0.02, 0.5)}s` }}
                >
                  <div className="relative z-10 flex-shrink-0">
                    <Avatar name={prof?.full_name} src={prof?.avatar_url} size="sm" />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-sm text-slate-300">
                      <span className="text-white font-medium">{prof?.full_name || 'Someone'}</span>{' '}
                      <span className="text-slate-400">{formatLogAction(act)}</span>{' '}
                      <span className="text-teal-300">{act.entity_type}</span>
                    </p>
                    {act.metadata && typeof act.metadata.title === 'string' && (
                      <p className="text-xs text-slate-500 mt-0.5">"{String(act.metadata.title)}"</p>
                    )}
                    <p className="text-[10px] text-slate-600 mt-0.5">{formatRelativeTime(act.created_at)}</p>
                  </div>
                  <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                    <Icon className="text-slate-400" size={14} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}