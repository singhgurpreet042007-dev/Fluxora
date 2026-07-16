import { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { Spinner } from '../components/Loader';
import { Mail, Lock, User, Eye, EyeOff, Zap, ArrowRight, Check } from 'lucide-react';

export function AuthPage() {
  const { signIn, signUp } = useAuth();
  const { show } = useToast();
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      setMousePos({
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      });
    };
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (mode === 'signup') {
      if (!fullName.trim()) {
        show('warning', 'Name required', 'Please enter your full name');
        setLoading(false);
        return;
      }
      if (password.length < 6) {
        show('warning', 'Password too short', 'Use at least 6 characters');
        setLoading(false);
        return;
      }
      const { error } = await signUp(email, password, fullName);
      if (error) {
        show('error', 'Sign up failed', error);
      } else {
        show('success', 'Welcome to Fluxora!', 'Your account is ready');
      }
    } else {
      const { error } = await signIn(email, password);
      if (error) {
        show('error', 'Sign in failed', error);
      } else {
        show('success', 'Welcome back!', 'Signed in successfully');
      }
    }
    setLoading(false);
  };

  const rotateX = (mousePos.y - 0.5) * -10;
  const rotateY = (mousePos.x - 0.5) * 10;

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 grid-pattern overflow-hidden">
      <div className="aurora-bg">
        <div className="aurora-blob" />
        <div className="aurora-blob" />
        <div className="aurora-blob" />
      </div>

      {/* Floating 3D orbs */}
      <div
        className="orb w-32 h-32 bg-teal-500/20 absolute top-[15%] left-[10%] animate-float-3d"
        style={{ animationDelay: '0s' }}
      />
      <div
        className="orb w-24 h-24 bg-amber-500/20 absolute bottom-[20%] right-[12%] animate-float-3d"
        style={{ animationDelay: '-3s' }}
      />
      <div
        className="orb w-40 h-40 bg-emerald-500/10 absolute bottom-[10%] left-[20%] animate-float-3d"
        style={{ animationDelay: '-5s' }}
      />

      <div className="relative z-10 w-full max-w-5xl grid lg:grid-cols-2 gap-8 items-center">
        {/* Left side — branding */}
        <div className="hidden lg:flex flex-col gap-8 p-8" style={{ perspective: '1000px' }}>
          <div
            className="flex items-center gap-3"
            style={{
              transform: `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
              transition: 'transform 0.3s ease-out',
            }}
          >
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center shadow-lg glow-accent">
              <Zap className="text-white" size={28} fill="white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold gradient-text font-display">Fluxora</h1>
              <p className="text-sm text-slate-400">Work, in flow.</p>
            </div>
          </div>

          <div className="space-y-6">
            <h2 className="text-4xl font-bold text-white font-display leading-tight">
              The workspace that
              <br />
              <span className="gradient-text">moves at your speed.</span>
            </h2>
            <p className="text-slate-400 text-lg leading-relaxed">
              Projects, tasks, teams, and insights — unified in one real-time platform.
              Built for momentum.
            </p>

            <div className="space-y-3">
              {[
                'Real-time collaboration across your team',
                'Smart analytics and activity tracking',
                'Beautiful, fast, and mobile-ready',
              ].map((feat, i) => (
                <div key={i} className="flex items-center gap-3 animate-fade-in-up" style={{ animationDelay: `${0.1 + i * 0.1}s` }}>
                  <div className="w-5 h-5 rounded-full bg-teal-500/20 flex items-center justify-center flex-shrink-0">
                    <Check className="text-teal-400" size={12} strokeWidth={3} />
                  </div>
                  <span className="text-slate-300">{feat}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-6 pt-4">
            <div>
              <p className="text-2xl font-bold text-white font-display">10k+</p>
              <p className="text-xs text-slate-500">Teams</p>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div>
              <p className="text-2xl font-bold text-white font-display">99.9%</p>
              <p className="text-xs text-slate-500">Uptime</p>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div>
              <p className="text-2xl font-bold text-white font-display">&lt;50ms</p>
              <p className="text-xs text-slate-500">Sync</p>
            </div>
          </div>
        </div>

        {/* Right side — auth form */}
        <div className="w-full max-w-md mx-auto">
          <div className="glass-strong rounded-3xl p-8 shadow-2xl animate-scale-in">
            {/* Mobile logo */}
            <div className="flex lg:hidden items-center gap-3 mb-6 justify-center">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center glow-accent">
                <Zap className="text-white" size={24} fill="white" />
              </div>
              <h1 className="text-2xl font-bold gradient-text font-display">Fluxora</h1>
            </div>

            <h2 className="text-2xl font-bold text-white mb-2 font-display">
              {mode === 'signup' ? 'Create your account' : 'Welcome back'}
            </h2>
            <p className="text-slate-400 text-sm mb-6">
              {mode === 'signup' ? 'Start your journey with Fluxora' : 'Sign in to continue to your workspace'}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div className="animate-fade-in-up">
                  <label className="text-xs font-medium text-slate-400 mb-1.5 block">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Jane Doe"
                      className="input-field w-full rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-600"
                      required
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="input-field w-full rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-600"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="input-field w-full rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder:text-slate-600"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-smooth"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Spinner size={18} />
                ) : (
                  <>
                    {mode === 'signup' ? 'Create Account' : 'Sign In'}
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-slate-400">
                {mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}{' '}
                <button
                  onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
                  className="text-teal-400 hover:text-teal-300 font-medium transition-smooth"
                >
                  {mode === 'signup' ? 'Sign in' : 'Sign up'}
                </button>
              </p>
            </div>
          </div>

          <p className="text-center text-xs text-slate-600 mt-4">
            By continuing you agree to Fluxora's Terms & Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
}