import { useState, useRef } from 'react';
import { useAuth } from '../lib/auth';
import { useOrg } from '../lib/org';
import { useToast } from '../lib/toast';
import { supabase } from '../lib/supabase';
import { Avatar } from '../components/Avatar';
import { Spinner } from '../components/Loader';
import { ConfirmDialog } from '../components/ui';

import {
  Settings, User, Mail, Clock, Save, Trash2, Building2, Crown,
  AlertTriangle, Camera,
} from 'lucide-react';

const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB

export function SettingsPage() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const { currentOrg, membership, createOrg } = useOrg();
  const { show } = useToast();
  const [tab, setTab] = useState<'profile' | 'organization' | 'danger'>('profile');
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [timezone, setTimezone] = useState(profile?.timezone || 'UTC');
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [orgName, setOrgName] = useState(currentOrg?.name || '');
  const [savingOrg, setSavingOrg] = useState(false);
  const [newOrg, setNewOrg] = useState('');
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [showDeleteOrg, setShowDeleteOrg] = useState(false);

  const handleAvatarChange = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      show('error', 'Invalid file', 'Please choose an image file');
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      show('error', 'File too large', 'Max size is 5MB');
      return;
    }

    setUploadingAvatar(true);
    const ext = file.name.split('.').pop();
    const storagePath = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(storagePath, file, { upsert: true });

    if (uploadError) {
      show('error', 'Upload failed', uploadError.message);
      setUploadingAvatar(false);
      return;
    }

    const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(storagePath);
    // Cache-bust so the new image shows immediately even though the path is stable.
    const avatarUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

    const { error: dbError } = await supabase
      .from('user_profiles')
      .upsert({ id: user.id, avatar_url: avatarUrl, updated_at: new Date().toISOString() });

    if (dbError) {
      show('error', 'Failed to save avatar', dbError.message);
    } else {
      show('success', 'Avatar updated');
      await refreshProfile();
    }
    setUploadingAvatar(false);
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase.from('user_profiles').upsert({
      id: user.id,
      full_name: fullName,
      timezone,
      updated_at: new Date().toISOString(),
    });
    if (error) show('error', 'Failed', error.message);
    else {
      show('success', 'Profile updated');
      await refreshProfile();
    }
    setSavingProfile(false);
  };

  const handleSaveOrg = async () => {
    if (!currentOrg || membership?.role !== 'admin') return;
    setSavingOrg(true);
    const { error } = await supabase.from('organizations').update({
      name: orgName,
      updated_at: new Date().toISOString(),
    }).eq('id', currentOrg.id);
    if (error) show('error', 'Failed', error.message);
    else show('success', 'Organization updated');
    setSavingOrg(false);
  };

  const handleDeleteOrg = async () => {
    if (!currentOrg || membership?.role !== 'admin') return;
    const { error } = await supabase.from('organizations').delete().eq('id', currentOrg.id);
    if (error) show('error', 'Failed', error.message);
    else {
      show('success', 'Organization deleted');
      setTimeout(() => window.location.reload(), 500);
    }
  };

  const handleCreateOrg = async () => {
    if (!newOrg.trim()) return;
    setCreatingOrg(true);
    const { error } = await createOrg(newOrg);
    if (error) show('error', 'Failed', error);
    else {
      show('success', 'Organization created', `${newOrg} is ready`);
      setNewOrg('');
    }
    setCreatingOrg(false);
  };

  if (!profile) {
    return <div className="flex items-center justify-center h-full min-h-[60vh]"><Spinner size={32} /></div>;
  }

  const tabs = [
    { id: 'profile' as const, label: 'Profile', icon: User },
    { id: 'organization' as const, label: 'Organization', icon: Building2 },
    ...(membership?.role === 'admin' ? [{ id: 'danger' as const, label: 'Danger Zone', icon: AlertTriangle }] : []),
  ];

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto">
      <div className="mb-6 animate-fade-in-up">
        <h1 className="text-2xl font-bold text-white font-display flex items-center gap-2">
          <Settings className="text-teal-400" size={24} />
          Settings
        </h1>
        <p className="text-slate-400 text-sm mt-1">Manage your account and workspace</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 glass rounded-xl p-1 animate-fade-in-up stagger-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-smooth ${
                tab === t.id ? 'bg-teal-500/20 text-teal-300' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Icon size={16} />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      {tab === 'profile' && (
        <div className="space-y-4 animate-fade-in-up">
          {/* Avatar card */}
          <div className="glass rounded-2xl p-6 flex items-center gap-4">
            <div className="relative group flex-shrink-0">
              <Avatar name={profile.full_name} src={profile.avatar_url} size="lg" />
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-smooth disabled:opacity-100"
                title="Change avatar"
              >
                {uploadingAvatar ? <Spinner size={18} /> : <Camera size={18} className="text-white" />}
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleAvatarChange(e.target.files)}
              />
            </div>
            <div>
              <p className="text-lg font-semibold text-white">{profile.full_name || 'User'}</p>
              <p className="text-sm text-slate-400">{user?.email}</p>
              <p className="text-xs text-slate-500 mt-1">Member since {new Date(user?.created_at || Date.now()).toLocaleDateString()}</p>
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="text-xs text-teal-400 hover:text-teal-300 mt-1.5 disabled:opacity-50"
              >
                Change photo
              </button>
            </div>
          </div>

          {/* Profile form */}
          <div className="glass rounded-2xl p-6 space-y-4">
            <h3 className="font-semibold text-white">Profile Information</h3>

            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input
                  type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
                  className="input-field w-full rounded-xl pl-10 pr-4 py-2.5 text-sm text-white"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Email (read-only)</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input
                  type="email" readOnly value={user?.email || ''}
                  className="input-field w-full rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-500 cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Timezone</label>
             <div className="relative">
  <Clock
    size={16}
    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
  />

  <select
    value={timezone}
    onChange={(e) => setTimezone(e.target.value)}
    className="input-field w-full rounded-xl pl-10 pr-4 py-2.5 text-sm text-white bg-transparent"
  >
    <option value="UTC">UTC</option>
    <option value="America/New_York">America/New_York</option>
    <option value="America/Chicago">America/Chicago</option>
    <option value="America/Denver">America/Denver</option>
    <option value="America/Los_Angeles">America/Los_Angeles</option>
    <option value="Europe/London">Europe/London</option>
    <option value="Europe/Paris">Europe/Paris</option>
    <option value="Asia/Tokyo">Asia/Tokyo</option>
    <option value="Asia/Kolkata">Asia/Kolkata</option>
    <option value="Australia/Sydney">Australia/Sydney</option>
  </select>
</div>
            </div>

            <button
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="btn-primary px-5 py-2.5 rounded-xl text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {savingProfile ? <Spinner size={16} /> : <Save size={16} />}
              Save Changes
            </button>
          </div>
        </div>
      )}

      {tab === 'organization' && (
        <div className="space-y-4 animate-fade-in-up">
          {/* Current org */}
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500/30 to-emerald-500/30 flex items-center justify-center">
                <Building2 className="text-teal-300" size={24} />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-white">{currentOrg?.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-slate-400 capitalize">{currentOrg?.plan} plan</span>
                  {membership?.role === 'admin' && (
                    <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                      <Crown size={10} /> Admin
                    </span>
                  )}
                </div>
              </div>
            </div>

            {membership?.role === 'admin' ? (
              <div className="space-y-4 border-t border-white/8 pt-4">
                <div>
                  <label className="text-xs font-medium text-slate-400 mb-1.5 block">Organization Name</label>
                  <input
                    type="text" value={orgName} onChange={(e) => setOrgName(e.target.value)}
                    className="input-field w-full rounded-xl px-4 py-2.5 text-sm text-white"
                  />
                </div>
                <button
                  onClick={handleSaveOrg}
                  disabled={savingOrg || !orgName.trim()}
                  className="btn-primary px-5 py-2.5 rounded-xl text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {savingOrg ? <Spinner size={16} /> : <Save size={16} />}
                  Save
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-500 border-t border-white/8 pt-4">Only admins can modify organization settings.</p>
            )}
          </div>

          {/* Create new org */}
          <div className="glass rounded-2xl p-6">
            <h3 className="font-semibold text-white mb-2">Create New Organization</h3>
            <p className="text-sm text-slate-400 mb-4">Start a new workspace for a different team or project.</p>
            <div className="flex gap-2">
              <input
                type="text" value={newOrg} onChange={(e) => setNewOrg(e.target.value)}
                placeholder="New organization name"
                className="input-field flex-1 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateOrg()}
              />
              <button
                onClick={handleCreateOrg}
                disabled={creatingOrg || !newOrg.trim()}
                className="btn-primary px-4 py-2.5 rounded-xl text-sm disabled:opacity-50"
              >
                {creatingOrg ? '...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'danger' && membership?.role === 'admin' && (
        <div className="space-y-4 animate-fade-in-up">
          <div className="glass rounded-2xl p-6 border border-rose-500/20">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="text-rose-400" size={20} />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-white">Delete Organization</h3>
                <p className="text-sm text-slate-400 mt-1 mb-4">
                  Permanently delete {currentOrg?.name} and all associated projects, tasks, and data.
                  This action cannot be undone.
                </p>
                <button
                  onClick={() => setShowDeleteOrg(true)}
                  className="bg-rose-500/10 border border-rose-500/30 text-rose-400 px-4 py-2 rounded-xl text-sm flex items-center gap-2 hover:bg-rose-500/20 transition-smooth"
                >
                  <Trash2 size={16} /> Delete Organization
                </button>
              </div>
            </div>
          </div>

          <div className="glass rounded-2xl p-6">
            <h3 className="font-semibold text-white mb-2">Sign Out</h3>
            <p className="text-sm text-slate-400 mb-4">Sign out of your Fluxora account on this device.</p>
            <button
              onClick={signOut}
              className="btn-ghost px-4 py-2 rounded-xl text-sm text-slate-300"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showDeleteOrg}
        onClose={() => setShowDeleteOrg(false)}
        onConfirm={handleDeleteOrg}
        title="Delete Organization"
        message={`This will permanently delete "${currentOrg?.name}" and ALL its projects and tasks. This cannot be undone.`}
        confirmLabel="Delete Everything"
      />
    </div>
  );
}