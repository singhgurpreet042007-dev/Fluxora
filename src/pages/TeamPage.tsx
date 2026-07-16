import { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { useOrg } from '../lib/org';
import { useToast } from '../lib/toast';
import { supabase } from '../lib/supabase';
import { logActivity, formatRelativeTime } from '../lib/utils';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ui';
import { Avatar } from '../components/Avatar';
import { Spinner } from '../components/Loader';
import type { UserProfile, OrgMember, Task } from '../lib/types';
import {
  UserPlus, MoreVertical, Trash2, Shield, Crown, Mail, Copy, Check,
} from 'lucide-react';

export function TeamPage() {
  const { user } = useAuth();
  const { currentOrg, membership } = useOrg();
  const { show } = useToast();
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [taskCounts, setTaskCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<OrgMember | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);

  const fetchMembers = async () => {
    if (!currentOrg) return;
    setLoading(true);
    const { data: memData } = await supabase
      .from('organization_members')
      .select('*')
      .eq('organization_id', currentOrg.id)
      .order('joined_at', { ascending: true });

    setMembers((memData as OrgMember[]) || []);

    if (memData && memData.length > 0) {
      const userIds = memData.map((m) => m.user_id);
      const [profRes, taskRes] = await Promise.all([
        supabase.from('user_profiles').select('*').in('id', userIds),
        supabase.from('tasks').select('assignee_id').eq('organization_id', currentOrg.id).neq('status', 'done'),
      ]);

      const profMap: Record<string, UserProfile> = {};
      (profRes.data || []).forEach((p) => { profMap[p.id] = p as UserProfile; });
      setProfiles(profMap);

      const counts: Record<string, number> = {};
      (taskRes.data || []).forEach((t) => {
        const a = (t as Task).assignee_id;
        if (a) counts[a] = (counts[a] || 0) + 1;
      });
      setTaskCounts(counts);
    }
    setLoading(false);
  };

  useEffect(() => { fetchMembers(); }, [currentOrg]);

  // Real-time for members
  useEffect(() => {
    if (!currentOrg) return;
    const channel = supabase
      .channel('members-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'organization_members', filter: `organization_id=eq.${currentOrg.id}` },
        () => { fetchMembers(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentOrg]);

  const handleRoleChange = async (member: OrgMember, newRole: 'admin' | 'member') => {
    if (!currentOrg || !user) return;
    const { error } = await supabase.from('organization_members').update({ role: newRole }).eq('id', member.id);
    if (error) show('error', 'Failed', error.message);
    else {
      show('success', 'Role updated', `${profiles[member.user_id]?.full_name || 'Member'} is now ${newRole}`);
      await logActivity(currentOrg.id, user.id, 'updated', 'member', member.id, { role: newRole });
    }
    setMenuOpen(null);
  };

  const handleRemove = async () => {
    if (!removeTarget || !currentOrg || !user) return;
    const { error } = await supabase.from('organization_members').delete().eq('id', removeTarget.id);
    if (error) show('error', 'Failed', error.message);
    else {
      show('success', 'Member removed');
      await logActivity(currentOrg.id, user.id, 'removed', 'member', removeTarget.id, {});
    }
    setRemoveTarget(null);
  };

  const handleGenerateInvite = () => {
    const link = `${window.location.origin}/?invite=${currentOrg?.id}&role=${inviteRole}`;
    setInviteLink(link);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    show('success', 'Link copied', 'Share it with your team');
  };

  const isAdmin = membership?.role === 'admin';

  if (loading) {
    return <div className="flex items-center justify-center h-full min-h-[60vh]"><Spinner size={32} /></div>;
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-bold text-white font-display">Team</h1>
          <p className="text-slate-400 text-sm mt-1">{members.length} member{members.length !== 1 ? 's' : ''} in {currentOrg?.name}</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowInvite(true)} className="btn-primary px-4 py-2.5 rounded-xl text-sm flex items-center gap-2">
            <UserPlus size={16} /> Invite
          </button>
        )}
      </div>

      <div className="glass rounded-2xl overflow-hidden animate-fade-in-up stagger-2">
        {members.map((m, i) => {
          const prof = profiles[m.user_id];
          const isYou = m.user_id === user?.id;
          const taskCount = taskCounts[m.user_id] || 0;
          return (
            <div
              key={m.id}
              className={`flex items-center gap-4 p-4 hover:bg-white/5 transition-smooth ${i !== members.length - 1 ? 'border-b border-white/5' : ''}`}
            >
              <Avatar name={prof?.full_name} src={prof?.avatar_url} size="md" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-white truncate">
                    {prof?.full_name || 'Unknown'}
                  </p>
                  {isYou && <span className="text-[10px] text-teal-400 bg-teal-500/10 px-1.5 py-0.5 rounded-full">You</span>}
                  {m.role === 'admin' && (
                    <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                      <Crown size={10} /> Admin
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Joined {formatRelativeTime(m.joined_at)} • {taskCount} active task{taskCount !== 1 ? 's' : ''}
                </p>
              </div>

              {isAdmin && !isYou && (
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen(menuOpen === m.id ? null : m.id)}
                    className="p-2 rounded-lg hover:bg-white/10 transition-smooth text-slate-400"
                  >
                    <MoreVertical size={16} />
                  </button>
                  {menuOpen === m.id && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(null)} />
                      <div className="absolute right-0 top-full mt-1 glass-strong rounded-xl shadow-2xl py-1 z-50 w-40 animate-scale-in">
                        <button
                          onClick={() => handleRoleChange(m, m.role === 'admin' ? 'member' : 'admin')}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-smooth text-sm text-slate-300"
                        >
                          <Shield size={14} />
                          {m.role === 'admin' ? 'Make Member' : 'Make Admin'}
                        </button>
                        <button
                          onClick={() => { setRemoveTarget(m); setMenuOpen(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-smooth text-sm text-rose-400"
                        >
                          <Trash2 size={14} /> Remove
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

      {/* Invite modal */}
      <Modal open={showInvite} onClose={() => { setShowInvite(false); setInviteLink(''); setInviteEmail(''); }} title="Invite Team Member">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Email (optional)</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="teammate@company.com"
                className="input-field w-full rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-600"
              />
            </div>
            {inviteEmail && (
              <p className="text-xs text-slate-500 mt-2">
                Note: The invited user needs to sign up with this email, then join via the link below.
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Role</label>
            <div className="flex gap-2">
              {(['member', 'admin'] as const).map((r) => (
                <button
                  key={r} onClick={() => setInviteRole(r)}
                  className={`flex-1 px-3 py-2.5 rounded-xl text-sm capitalize transition-smooth ${
                    inviteRole === r ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30' : 'btn-ghost text-slate-400'
                  }`}
                >
                  {r === 'admin' && <Crown size={14} className="inline mr-1" />}
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-white/8 pt-4">
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Invite Link</label>
            {inviteLink ? (
              <div className="flex gap-2">
                <input
                  readOnly value={inviteLink}
                  className="input-field flex-1 rounded-xl px-3 py-2.5 text-xs text-slate-300 font-mono"
                />
                <button onClick={handleCopy} className="btn-primary px-3 py-2.5 rounded-xl text-sm flex items-center gap-1">
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
            ) : (
              <button onClick={handleGenerateInvite} className="btn-ghost w-full rounded-xl py-2.5 text-sm text-slate-300">
                Generate Invite Link
              </button>
            )}
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => { setShowInvite(false); setInviteLink(''); }} className="btn-ghost px-4 py-2 rounded-lg text-sm text-slate-300">
              Close
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemove}
        title="Remove Member"
        message={`Remove ${removeTarget ? profiles[removeTarget.user_id]?.full_name || 'this member' : ''} from ${currentOrg?.name}?`}
        confirmLabel="Remove"
      />
    </div>
  );
}
