import { useEffect, useState } from 'react';
import { useOrg } from '../lib/org';
import { useToast } from '../lib/toast';
import { Spinner, FullPageLoader } from '../components/Loader';
import { Zap, Building2, Crown, Check, X } from 'lucide-react';
import type { Invitation } from '../lib/types';

interface InvitePageProps {
  token: string;
  onDone: () => void;
}

export function InvitePage({ token, onDone }: InvitePageProps) {
  const { getInviteByToken, acceptInvite } = useOrg();
  const { show } = useToast();
  const [invite, setInvite] = useState<Invitation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    getInviteByToken(token).then(({ invite, error }) => {
      setInvite(invite);
      setError(error);
      setLoading(false);
    });
  }, [token, getInviteByToken]);

  const handleAccept = async () => {
    if (!invite) return;
    setAccepting(true);
    const { error } = await acceptInvite(invite);
    if (error) {
      show('error', 'Could not join', error);
      setAccepting(false);
    } else {
      show('success', 'Welcome!', `You've joined ${invite.organization_name}`);
      onDone();
    }
  };

  if (loading) return <FullPageLoader />;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 grid-pattern relative overflow-hidden">
      <div className="aurora-bg">
        <div className="aurora-blob" />
        <div className="aurora-blob" />
      </div>

      <div className="relative z-10 w-full max-w-lg">
        <div className="glass-strong rounded-3xl p-8 shadow-2xl animate-scale-in">
          <div className="flex items-center gap-3 mb-8 justify-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center glow-accent">
              <Zap className="text-white" size={28} fill="white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold gradient-text font-display">Fluxora</h1>
              <p className="text-xs text-slate-400">Work, in flow</p>
            </div>
          </div>

          {error || !invite ? (
            <div className="text-center">
              <h2 className="text-xl font-bold text-white font-display mb-2">Invite not available</h2>
              <p className="text-slate-400 text-sm mb-6">{error || 'This invite link could not be found.'}</p>
              <button onClick={onDone} className="btn-primary rounded-xl py-2.5 px-5 text-sm">
                Continue to Fluxora
              </button>
            </div>
          ) : (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-teal-500/30 to-emerald-500/30 flex items-center justify-center mb-4">
                <Building2 className="text-teal-300" size={28} />
              </div>
              <h2 className="text-xl font-bold text-white font-display mb-1">
                Join {invite.organization_name}
              </h2>
              <p className="text-slate-400 text-sm mb-6 flex items-center justify-center gap-1.5">
                You've been invited as a
                <span className="inline-flex items-center gap-1 text-teal-300 font-medium">
                  {invite.role === 'admin' && <Crown size={12} />}
                  {invite.role}
                </span>
              </p>

              <div className="flex gap-3 justify-center">
                <button
                  onClick={onDone}
                  disabled={accepting}
                  className="btn-ghost px-5 py-2.5 rounded-xl text-sm text-slate-300 flex items-center gap-2"
                >
                  <X size={16} /> Decline
                </button>
                <button
                  onClick={handleAccept}
                  disabled={accepting}
                  className="btn-primary px-5 py-2.5 rounded-xl text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {accepting ? <Spinner size={16} /> : <Check size={16} />}
                  Accept &amp; Join
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
