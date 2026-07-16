import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { useOrg } from '../lib/org';
import { useToast } from '../lib/toast';
import { Spinner } from '../components/Loader';
import { Zap, ArrowRight, Building2, Sparkles } from 'lucide-react';

export function OnboardingPage() {
  const { profile } = useAuth();
  const { createOrg } = useOrg();
  const { show } = useToast();
  const [orgName, setOrgName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!orgName.trim()) return;
    setCreating(true);
    const { error } = await createOrg(orgName);
    if (error) show('error', 'Failed', error);
    else show('success', 'Welcome to Fluxora!', `${orgName} is ready`);
    setCreating(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 grid-pattern relative overflow-hidden">
      <div className="aurora-bg">
        <div className="aurora-blob" />
        <div className="aurora-blob" />
      </div>

      <div className="relative z-10 w-full max-w-lg">
        <div className="glass-strong rounded-3xl p-8 shadow-2xl animate-scale-in">
          <div className="flex items-center gap-3 mb-8 justify-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center glow-accent animate-float-3d">
              <Zap className="text-white" size={28} fill="white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold gradient-text font-display">Fluxora</h1>
              <p className="text-xs text-slate-400">Work, in flow</p>
            </div>
          </div>

          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-300 text-xs mb-4">
              <Sparkles size={12} />
              Welcome, {profile?.full_name?.split(' ')[0] || 'there'}!
            </div>
            <h2 className="text-2xl font-bold text-white font-display mb-2">Set up your workspace</h2>
            <p className="text-slate-400 text-sm">
              Create your first organization to start managing projects, tasks, and your team.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Organization Name</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Acme Inc."
                  className="input-field w-full rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-600"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
              </div>
            </div>

            <button
              onClick={handleCreate}
              disabled={creating || !orgName.trim()}
              className="btn-primary w-full rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? (
                <Spinner size={18} />
              ) : (
                <>
                  Create Workspace
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>

          <p className="text-center text-xs text-slate-600 mt-6">
            You'll be the admin of this organization and can invite team members later.
          </p>
        </div>
      </div>
    </div>
  );
}