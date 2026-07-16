import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../lib/auth';
import { useOrg } from '../lib/org';
import { useToast } from '../lib/toast';
import { supabase } from '../lib/supabase';
import { logActivity, statusColor, priorityColor, createNotification } from '../lib/utils';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ui';
import { Avatar } from '../components/Avatar';
import { Spinner } from '../components/Loader';
import { FileAttachments } from '../components/FileAttachments';
import type { Task, TaskStatus, TaskPriority, Project, UserProfile, OrgMember } from '../lib/types';
import {
  Plus, CheckSquare, MoreVertical, Trash2, Edit3, Calendar,
  Filter, X,
} from 'lucide-react';

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'review', 'done'];
const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

export function TasksPage() {
  const { user, profile } = useAuth();
  const { currentOrg, membership } = useOrg();
  const { show } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<TaskStatus | 'all'>('all');
  const [filterProject, setFilterProject] = useState<string | 'all'>('all');
  const [view, setView] = useState<'list' | 'board'>('board');

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskStatus, setTaskStatus] = useState<TaskStatus>('todo');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('medium');
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string>('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    if (!currentOrg || !user) return;
    setLoading(true);
    const [tasksRes, projRes, memRes] = await Promise.all([
      supabase.from('tasks').select('*').eq('organization_id', currentOrg.id).order('updated_at', { ascending: false }),
      supabase.from('projects').select('*').eq('organization_id', currentOrg.id),
      supabase.from('organization_members').select('*').eq('organization_id', currentOrg.id),
    ]);

    setTasks((tasksRes.data as Task[]) || []);
    setProjects((projRes.data as Project[]) || []);
    setMembers((memRes.data as OrgMember[]) || []);

    if (memRes.data && memRes.data.length > 0) {
      const userIds = memRes.data.map((m) => m.user_id);
      const { data: profs } = await supabase.from('user_profiles').select('*').in('id', userIds);
      const profMap: Record<string, UserProfile> = {};
      (profs || []).forEach((p) => { profMap[p.id] = p as UserProfile; });
      setProfiles(profMap);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [currentOrg, user]);

  // Real-time
  useEffect(() => {
    if (!currentOrg) return;
    const channel = supabase
      .channel('tasks-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `organization_id=eq.${currentOrg.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') setTasks((prev) => [payload.new as Task, ...prev.filter((t) => t.id !== (payload.new as Task).id)]);
          if (payload.eventType === 'UPDATE') setTasks((prev) => [payload.new as Task, ...prev.filter((t) => t.id !== (payload.new as Task).id)]);
          if (payload.eventType === 'DELETE') setTasks((prev) => prev.filter((t) => t.id !== (payload.old as Task).id));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentOrg]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterStatus !== 'all' && t.status !== filterStatus) return false;
      if (filterProject !== 'all' && t.project_id !== filterProject) return false;
      return true;
    });
  }, [tasks, filterStatus, filterProject]);

  const boardColumns = useMemo(() => {
    const cols: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], review: [], done: [] };
    filteredTasks.forEach((t) => cols[t.status].push(t));
    return cols;
  }, [filteredTasks]);

  const openCreate = () => {
    setEditing(null);
    setTitle(''); setDescription(''); setTaskStatus('todo'); setTaskPriority('medium');
    setAssigneeId(user?.id ?? null); setProjectId(projects[0]?.id ?? ''); setDueDate('');
    setShowCreate(true);
  };

  const openEdit = (t: Task) => {
    setEditing(t);
    setTitle(t.title); setDescription(t.description || ''); setTaskStatus(t.status); setTaskPriority(t.priority);
    setAssigneeId(t.assignee_id); setProjectId(t.project_id); setDueDate(t.due_date || '');
    setShowCreate(true); setMenuOpen(null);
  };

  const handleSave = async () => {
    if (!currentOrg || !user || !title.trim() || !projectId) return;
    setSaving(true);

    if (editing) {
      const oldAssignee = editing.assignee_id;
      const { error } = await supabase.from('tasks').update({
        title, description, status: taskStatus, priority: taskPriority,
        assignee_id: assigneeId, project_id: projectId,
        due_date: dueDate || null, updated_at: new Date().toISOString(),
      }).eq('id', editing.id);
      if (error) show('error', 'Update failed', error.message);
      else {
        show('success', 'Task updated');
        await logActivity(currentOrg.id, user.id, 'updated', 'task', editing.id, { title });
        if (assigneeId && assigneeId !== oldAssignee) {
          await createNotification(assigneeId, currentOrg.id, 'Task assigned', `${profile?.full_name || 'Someone'} assigned you: ${title}`);
        }
        setShowCreate(false);
      }
    } else {
      const { data, error } = await supabase.from('tasks').insert({
        organization_id: currentOrg.id, project_id: projectId, title, description,
        status: taskStatus, priority: taskPriority, assignee_id: assigneeId,
        due_date: dueDate || null,
      }).select('*').single();
      if (error) show('error', 'Create failed', error.message);
      else {
        show('success', 'Task created');
        await logActivity(currentOrg.id, user.id, 'created', 'task', data.id, { title });
        if (assigneeId && assigneeId !== user.id) {
          await createNotification(assigneeId, currentOrg.id, 'Task assigned', `${profile?.full_name || 'Someone'} assigned you: ${title}`);
        }
        setShowCreate(false);
      }
    }
    setSaving(false);
  };

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || !currentOrg || !user) return;
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: newStatus } : t));
    const { error } = await supabase.from('tasks').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', taskId);
    if (error) {
      show('error', 'Update failed', error.message);
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: task.status } : t));
    } else {
      await logActivity(currentOrg.id, user.id, 'status_changed', 'task', taskId, { from: task.status, to: newStatus, title: task.title });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !currentOrg || !user) return;
    const { error } = await supabase.from('tasks').delete().eq('id', deleteTarget.id);
    if (error) show('error', 'Delete failed', error.message);
    else {
      show('success', 'Task deleted');
      await logActivity(currentOrg.id, user.id, 'deleted', 'task', deleteTarget.id, { title: deleteTarget.title });
    }
    setDeleteTarget(null);
  };

  const canEdit = (t: Task) => membership?.role === 'admin' || t.created_by === user?.id || t.assignee_id === user?.id;

  if (loading) {
    return <div className="flex items-center justify-center h-full min-h-[60vh]"><Spinner size={32} /></div>;
  }

  const TaskCard = ({ task }: { task: Task }) => {
    const pCol = priorityColor(task.priority);
    const proj = projects.find((p) => p.id === task.project_id);
    const assignee = task.assignee_id ? profiles[task.assignee_id] : null;
    const editable = canEdit(task);
    return (
      <div className="glass rounded-xl p-3.5 group cursor-pointer hover:border-white/12 transition-smooth animate-scale-in">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className={`${pCol.dot} status-dot flex-shrink-0`} />
            <p className="text-sm text-white truncate font-medium">{task.title}</p>
          </div>
          {editable && (
            <div className="relative flex-shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === task.id ? null : task.id); }}
                className="p-1 rounded hover:bg-white/10 transition-smooth text-slate-500 opacity-0 group-hover:opacity-100"
              >
                <MoreVertical size={14} />
              </button>
              {menuOpen === task.id && (
                <>
                  <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenuOpen(null); }} />
                  <div className="absolute right-0 top-full mt-1 glass-strong rounded-xl shadow-2xl py-1 z-50 w-32 animate-scale-in" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => openEdit(task)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-smooth text-sm text-slate-300">
                      <Edit3 size={14} /> Edit
                    </button>
                    <button onClick={() => { setDeleteTarget(task); setMenuOpen(null); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-smooth text-sm text-rose-400">
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        {task.description && <p className="text-xs text-slate-500 mb-2 line-clamp-2">{task.description}</p>}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {proj && (
              <span className="text-[10px] px-1.5 py-0.5 rounded text-slate-400 flex items-center gap-1 flex-shrink-0" style={{ background: `${proj.color}15` }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: proj.color }} />
                <span className="truncate max-w-[80px]">{proj.name}</span>
              </span>
            )}
            {task.due_date && (
              <span className="text-[10px] text-slate-500 flex items-center gap-1 flex-shrink-0">
                <Calendar size={10} /> {new Date(task.due_date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
          {assignee && <Avatar name={assignee.full_name} src={assignee.avatar_url} size="xs" />}
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-bold text-white font-display">My Tasks</h1>
          <p className="text-slate-400 text-sm mt-1">{filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-white/5 rounded-xl p-1">
            <button onClick={() => setView('board')} className={`px-3 py-1.5 rounded-lg text-xs transition-smooth ${view === 'board' ? 'bg-teal-500/20 text-teal-300' : 'text-slate-400'}`}>Board</button>
            <button onClick={() => setView('list')} className={`px-3 py-1.5 rounded-lg text-xs transition-smooth ${view === 'list' ? 'bg-teal-500/20 text-teal-300' : 'text-slate-400'}`}>List</button>
          </div>
          <button onClick={openCreate} className="btn-primary px-4 py-2 rounded-xl text-sm flex items-center gap-2">
            <Plus size={16} /> New Task
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-5 flex-wrap animate-fade-in-up stagger-1">
        <Filter size={14} className="text-slate-500" />
        <select
          value={filterProject} onChange={(e) => setFilterProject(e.target.value)}
          className="input-field rounded-lg px-3 py-1.5 text-xs text-white"
        >
          <option value="all">All Projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {view === 'list' && (
          <select
            value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as TaskStatus | 'all')}
            className="input-field rounded-lg px-3 py-1.5 text-xs text-white"
          >
            <option value="all">All Status</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        )}
        {(filterProject !== 'all' || filterStatus !== 'all') && (
          <button onClick={() => { setFilterProject('all'); setFilterStatus('all'); }} className="text-xs text-slate-500 hover:text-white flex items-center gap-1">
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {filteredTasks.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center animate-fade-in-up stagger-2">
          <div className="w-16 h-16 rounded-2xl bg-teal-500/10 flex items-center justify-center mx-auto mb-4">
            <CheckSquare className="text-teal-400" size={32} />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No tasks found</h3>
          <p className="text-slate-400 text-sm mb-6">Create a task to get started</p>
          <button onClick={openCreate} className="btn-primary px-5 py-2.5 rounded-xl text-sm inline-flex items-center gap-2">
            <Plus size={16} /> Create Task
          </button>
        </div>
      ) : view === 'board' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 lg:gap-4">
          {STATUSES.map((status, colIdx) => {
            const colTasks = boardColumns[status];
            const sCol = statusColor(status);
            return (
              <div key={status} className="animate-fade-in-up" style={{ animationDelay: `${colIdx * 0.05}s` }}>
                <div className="glass rounded-2xl p-3 h-full min-h-[200px]">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <span className={sCol.dot + ' status-dot'} />
                      <h3 className="text-sm font-semibold text-white capitalize">{status.replace('_', ' ')}</h3>
                    </div>
                    <span className="text-xs text-slate-500 bg-white/5 px-2 py-0.5 rounded-full">{colTasks.length}</span>
                  </div>
                  <div className="space-y-2">
                    {colTasks.map((task) => (
                      <div key={task.id} className="group relative">
                        <TaskCard task={task} />
                        {canEdit(task) && (
                          <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {STATUSES.filter((s) => s !== task.status).map((s) => (
                              <button
                                key={s} onClick={() => handleStatusChange(task.id, s)}
                                className="flex-1 text-[10px] py-1 rounded-md bg-white/5 hover:bg-teal-500/20 text-slate-500 hover:text-teal-300 transition-smooth capitalize"
                              >
                                {s.replace('_', ' ')}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {colTasks.length === 0 && (
                      <div className="text-center py-6 text-xs text-slate-600">Empty</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2 animate-fade-in-up">
          {filteredTasks.map((task) => {
            const sCol = statusColor(task.status);
            const pCol = priorityColor(task.priority);
            const proj = projects.find((p) => p.id === task.project_id);
            const assignee = task.assignee_id ? profiles[task.assignee_id] : null;
            return (
              <div key={task.id} className="glass rounded-xl p-3.5 flex items-center gap-3 group hover:border-white/12 transition-smooth">
                <span className={`${pCol.dot} status-dot flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{task.title}</p>
                  {proj && <p className="text-xs text-slate-500 truncate">{proj.name}</p>}
                </div>
                {task.due_date && (
                  <span className="text-xs text-slate-500 flex items-center gap-1 hidden sm:flex flex-shrink-0">
                    <Calendar size={12} /> {new Date(task.due_date).toLocaleDateString()}
                  </span>
                )}
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${pCol.bg} ${pCol.text} capitalize hidden sm:inline flex-shrink-0`}>
                  {task.priority}
                </span>
                <select
                  value={task.status}
                  onChange={(e) => handleStatusChange(task.id, e.target.value as TaskStatus)}
                  disabled={!canEdit(task)}
                  className={`text-[10px] px-2 py-1 rounded-full ${sCol.bg} ${sCol.text} capitalize border-0 cursor-pointer disabled:cursor-default flex-shrink-0`}
                  style={{ background: 'transparent', appearance: 'none' }}
                >
                  {STATUSES.map((s) => <option key={s} value={s} className="bg-slate-800">{s.replace('_', ' ')}</option>)}
                </select>
                {assignee && <Avatar name={assignee.full_name} src={assignee.avatar_url} size="xs" className="flex-shrink-0" />}
                {canEdit(task) && (
                  <div className="relative flex-shrink-0">
                    <button onClick={() => setMenuOpen(menuOpen === task.id ? null : task.id)} className="p-1 rounded hover:bg-white/10 transition-smooth text-slate-500">
                      <MoreVertical size={14} />
                    </button>
                    {menuOpen === task.id && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(null)} />
                        <div className="absolute right-0 top-full mt-1 glass-strong rounded-xl shadow-2xl py-1 z-50 w-32 animate-scale-in">
                          <button onClick={() => openEdit(task)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-smooth text-sm text-slate-300">
                            <Edit3 size={14} /> Edit
                          </button>
                          <button onClick={() => { setDeleteTarget(task); setMenuOpen(null); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-smooth text-sm text-rose-400">
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title={editing ? 'Edit Task' : 'New Task'} size="md">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to be done?"
              className="input-field w-full rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600" autoFocus />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add details..." rows={3}
              className="input-field w-full rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Project</label>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input-field w-full rounded-xl px-3 py-2.5 text-sm text-white">
                <option value="">Select...</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Assignee</label>
              <select value={assigneeId ?? ''} onChange={(e) => setAssigneeId(e.target.value || null)} className="input-field w-full rounded-xl px-3 py-2.5 text-sm text-white">
                <option value="">Unassigned</option>
                {members.map((m) => {
                  const prof = profiles[m.user_id];
                  return <option key={m.id} value={m.user_id}>{prof?.full_name || 'Member'}</option>;
                })}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Status</label>
              <select value={taskStatus} onChange={(e) => setTaskStatus(e.target.value as TaskStatus)} className="input-field w-full rounded-xl px-3 py-2.5 text-sm text-white">
                {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Priority</label>
              <select value={taskPriority} onChange={(e) => setTaskPriority(e.target.value as TaskPriority)} className="input-field w-full rounded-xl px-3 py-2.5 text-sm text-white">
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Due Date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input-field w-full rounded-xl px-4 py-2.5 text-sm text-white" />
          </div>
          {editing && (
            <div className="border-t border-white/8 pt-4">
              <FileAttachments taskId={editing.id} />
            </div>
          )}
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setShowCreate(false)} className="btn-ghost px-4 py-2 rounded-lg text-sm text-slate-300">Cancel</button>
            <button onClick={handleSave} disabled={saving || !title.trim() || !projectId} className="btn-primary px-4 py-2 rounded-lg text-sm disabled:opacity-50">
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Task"
        message={`Delete "${deleteTarget?.title}"? This cannot be undone.`}
      />
    </div>
  );
}