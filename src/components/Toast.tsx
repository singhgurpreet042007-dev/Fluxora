import { useEffect, type ReactNode } from 'react';
import { CheckCircle2, XCircle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastData {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastProps {
  toast: ToastData;
  onClose: (id: string) => void;
}

export function Toast({ toast, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => onClose(toast.id), 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onClose]);

  const config = {
    success: { icon: CheckCircle2, color: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/5' },
    error: { icon: XCircle, color: 'text-rose-400', border: 'border-rose-500/30', bg: 'bg-rose-500/5' },
    warning: { icon: AlertCircle, color: 'text-amber-400', border: 'border-amber-500/30', bg: 'bg-amber-500/5' },
    info: { icon: Info, color: 'text-teal-400', border: 'border-teal-500/30', bg: 'bg-teal-500/5' },
  };

  const { icon: Icon, color, border, bg } = config[toast.type];

  return (
    <div className={`glass-strong ${border} ${bg} border rounded-xl px-4 py-3 shadow-2xl animate-slide-in-right min-w-[280px] max-w-md`}>
      <div className="flex items-start gap-3">
        <Icon className={`${color} flex-shrink-0 mt-0.5`} size={20} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">{toast.title}</p>
          {toast.message && <p className="text-xs text-slate-400 mt-0.5">{toast.message}</p>}
        </div>
        <button
          onClick={() => onClose(toast.id)}
          className="text-slate-500 hover:text-white transition-smooth"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

interface ToastContainerProps {
  toasts: ToastData[];
  onClose: (id: string) => void;
}

export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <Toast toast={t} onClose={onClose} />
        </div>
      ))}
    </div>
  );
}

export function useToast() {
  let _toasts: ToastData[] = [];
  let _setToasts: ((toasts: ToastData[]) => void) | null = null;

  function init(toasts: ToastData[], setToasts: (t: ToastData[]) => void) {
    _toasts = toasts;
    _setToasts = setToasts;
  }

  function show(type: ToastType, title: string, message?: string) {
    if (!_setToasts) return;
    const id = Math.random().toString(36).slice(2);
    _setToasts([..._toasts, { id, type, title, message }]);
  }

  function dismiss(id: string) {
    if (!_setToasts) return;
    _setToasts(_toasts.filter((t) => t.id !== id));
  }

  return { init, show, dismiss };
}

export const toastStore: { current: ((type: ToastType, title: string, message?: string) => void) | null } = { current: null };

export function showToast(type: ToastType, title: string, message?: string) {
  toastStore.current?.(type, title, message);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  // This is a simplified toast system using a global store
  return <>{children}</>;
}
