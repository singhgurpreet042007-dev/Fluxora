import { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { useOrg } from '../lib/org';
import { useToast } from '../lib/toast';
import { supabase } from '../lib/supabase';
import { logActivity, statusColor } from '../lib/utils';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ui';
import { Spinner } from '../components/Loader';
import type { Project, ProjectStatus } from '../lib/types';
import {
  Plus, FolderKanban, MoreVertical, Trash2, Edit3,
} from 'lucide-react';

const COLORS = ['#14b8a6', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#06b6d4', '#84cc16', '#ec4899'];

export function ProjectsPage() {
  const { user } = useAuth();
  const { currentOrg, membership } = useOrg();
  const { show } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [taskCounts, setTaskCounts] = useState<Record<string, { total: number; done: number }>>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [status, setStatus] = useState<ProjectStatus>('active');
  const [saving, setSaving] = useState(false);

  const fetchProjects = async () => {
    if (!currentOrg) return;
    setLoading(true);
    const { data } = await supabase.from('projects').select('*').eq('organization_id', currentOrg.id).order('created_at', { ascending: false });
    setProjects((data as Project[]) || []);

    if (data && data.length > 0) {
      const counts: Record<string, { total: number; done: number }> = {};
      await Promise.all(data.map(async (p) => {
        const { count: total } = await supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('project_id', p.id);
        const { count: done } = await supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('project_id', p.id).eq('status', 'done');
        counts[p.id] = { total: total || 0, done: done || 0 };
      }));
      setTaskCounts(counts);
    }
    setLoading(false);
  };

  useEffect(() => { fetchProjects(); }, [currentOrg]);

  // Real-time
  useEffect(() => {
    if (!currentOrg) return;
    const channel = supabase
      .channel('projects-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects', filter: `organization_id=eq.${currentOrg.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') setProjects((prev) => [payload.new as Project, ...prev]);
          if (payload.eventType === 'UPDATE') setProjects((prev) => prev.map((p) => p.id === (payload.new as Project).id ? payload.new as Project : p));
          if (payload.eventType === 'DELETE') setProjects((prev) => prev.filter((p) => p.id !== (payload.old as Project).id));
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `organization_id=eq.${currentOrg.id}` },
        () => { fetchProjects(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentOrg]);

  const openCreate = () => {
    setEditing(null);
    setName(''); setDescription(''); setColor(COLORS[0]); setStatus('active');
    setShowCreate(true);
  };

  const openEdit = (p: Project) => {
    setEditing(p);
    setName(p.name); setDescription(p.description || ''); setColor(p.color); setStatus(p.status);
    setShowCreate(true); setMenuOpen(null);
  };

  const handleSave = async () => {
    if (!currentOrg || !user || !name.trim()) return;
    setSaving(true);

    if (editing) {
      const { error } = await supabase.from('projects').update({
        name, description, color, status, updated_at: new Date().toISOString(),
      }).eq('id', editing.id);
      if (error) show('error', 'Update failed', error.message);
      else {
        show('success', 'Project updated');
        await logActivity(currentOrg.id, user.id, 'updated', 'project', editing.id, { name });
        setShowCreate(false);
      }
    } else {
      const { data, error } = await supabase.from('projects').insert({
        organization_id: currentOrg.id, name, description, color, status,
      }).select('*').single();
      if (error) show('error', 'Create failed', error.message);
      else {
        show('success', 'Project created');
        await logActivity(currentOrg.id, user.id, 'created', 'project', data.id, { name });
        setShowCreate(false);
      }
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget || !currentOrg || !user) return;
    const { error } = await supabase.from('projects').delete().eq('id', deleteTarget.id);
    if (error) show('error', 'Delete failed', error.message);
    else {
      show('success', 'Project deleted');
      await logActivity(currentOrg.id, user.id, 'deleted', 'project', deleteTarget.id, { name: deleteTarget.name });
    }
    setDeleteTarget(null);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full min-h-[60vh]"><Spinner size={32} /></div>;
  }

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-bold text-white font-display">Projects</h1>
          <p className="text-slate-400 text-sm mt-1">{projects.length} project{projects.length !== 1 ? 's' : ''} in {currentOrg?.name}</p>
        </div>
        <button onClick={openCreate} className="btn-primary px-4 py-2.5 rounded-xl text-sm flex items-center gap-2">
          <Plus size={16} /> New Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center animate-fade-in-up stagger-2">
          <div className="w-16 h-16 rounded-2xl bg-teal-500/10 flex items-center justify-center mx-auto mb-4">
            <FolderKanban className="text-teal-400" size={32} />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No projects yet</h3>
          <p className="text-slate-400 text-sm mb-6">Create your first project to start organizing tasks</p>
          <button onClick={openCreate} className="btn-primary px-5 py-2.5 rounded-xl text-sm inline-flex items-center gap-2">
            <Plus size={16} /> Create Project
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p, i) => {
            const counts = taskCounts[p.id] || { total: 0, done: 0 };
            const progress = counts.total > 0 ? Math.round((counts.done / counts.total) * 100) : 0;
            const sCol = statusColor(p.status);
            return (
              <div
                key={p.id}
                className="glass rounded-2xl p-5 card-3d animate-fade-in-up relative group overflow-hidden"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full blur-2xl opacity-30" style={{ background: p.color }} />
                <div className="relative">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${p.color}20` }}>
                      <FolderKanban style={{ color: p.color }} size={20} />
                    </div>
                    {membership?.role === 'admin' && (
                      <div className="relative">
                        <button
                          onClick={() => setMenuOpen(menuOpen === p.id ? null : p.id)}
                          className="p-1.5 rounded-lg hover:bg-white/10 transition-smooth text-slate-400"
                        >
                          <MoreVertical size={16} />
                        </button>
                        {menuOpen === p.id && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(null)} />
                            <div className="absolute right-0 top-full mt-1 glass-strong rounded-xl shadow-2xl py-1 z-50 w-36 animate-scale-in">
                              <button onClick={() => openEdit(p)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-smooth text-sm text-slate-300">
                                <Edit3 size={14} /> Edit
                              </button>
                              <button onClick={() => { setDeleteTarget(p); setMenuOpen(null); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-smooth text-sm text-rose-400">
                                <Trash2 size={14} /> Delete
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <h3 className="font-semibold text-white mb-1 truncate">{p.name}</h3>
                  <p className="text-xs text-slate-400 mb-4 line-clamp-2 min-h-[2rem]">{p.description || 'No description'}</p>

                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${sCol.bg} ${sCol.text} capitalize`}>{p.status}</span>
                    <span className="text-xs text-slate-500">{counts.done}/{counts.total} tasks</span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${progress}%`, background: p.color }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title={editing ? 'Edit Project' : 'New Project'}>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Name</label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name"
              className="input-field w-full rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600" autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Description</label>
            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's this project about?" rows={3}
              className="input-field w-full rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Color</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button
                  key={c} onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-lg transition-smooth ${color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-110' : 'hover:scale-105'}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Status</label>
            <div className="flex gap-2">
              {(['active', 'archived', 'completed'] as ProjectStatus[]).map((s) => (
                <button
                  key={s} onClick={() => setStatus(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs capitalize transition-smooth ${
                    status === s ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30' : 'btn-ghost text-slate-400'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setShowCreate(false)} className="btn-ghost px-4 py-2 rounded-lg text-sm text-slate-300">Cancel</button>
            <button onClick={handleSave} disabled={saving || !name.trim()} className="btn-primary px-4 py-2 rounded-lg text-sm disabled:opacity-50">
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Project"
        message={`Delete "${deleteTarget?.name}"? All tasks in this project will be permanently removed.`}
      />
    </div>
  );
}
