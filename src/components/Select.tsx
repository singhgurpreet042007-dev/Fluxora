import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  icon?: ReactNode;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** 'md' (default): full-width form field, py-2.5, rounded-xl.
   *  'sm': compact inline filter, auto width, py-1.5 text-xs, rounded-lg. */
  size?: 'md' | 'sm';
}

/**
 * A fully custom, themeable dropdown that replaces the native <select>.
 *
 * Why: a native <select>'s open option list is rendered by the OS/browser
 * chrome, outside the page's DOM — no amount of CSS can theme it, and in
 * some embedded webviews (e.g. preview iframes) it renders as an oversized
 * plain-white box, which is exactly the visual bug this fixes. Building the
 * list ourselves means it always matches the app's dark theme, everywhere.
 */
export function Select({ value, onChange, options, icon, placeholder, className = '', disabled, size = 'md' }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const idx = options.findIndex((o) => o.value === value);
    setHighlighted(idx >= 0 ? idx : 0);
  }, [open, value, options]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, options.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)); }
      if (e.key === 'Enter') {
        e.preventDefault();
        const opt = options[highlighted];
        if (opt) { onChange(opt.value); close(); }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, options, highlighted, onChange, close]);

  useEffect(() => {
    if (open) {
      listRef.current?.querySelector(`[data-idx="${highlighted}"]`)?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlighted, open]);

  const widthClass = size === 'sm' ? '' : 'w-full';
  const paddingClass = size === 'sm'
    ? `${icon ? 'pl-8' : 'pl-3.5'} pr-8 py-1.5 text-xs rounded-lg`
    : `${icon ? 'pl-10' : 'pl-3.5'} pr-9 py-2.5 text-sm rounded-xl`;
  const iconPos = size === 'sm' ? 'left-2.5' : 'left-3';
  const chevronPos = size === 'sm' ? 'right-2.5' : 'right-3';

  return (
    <div ref={rootRef} className={`relative inline-block ${widthClass} ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`input-field ${widthClass} ${paddingClass} text-white text-left disabled:opacity-50 disabled:cursor-not-allowed relative`}
      >
        {icon && <span className={`absolute ${iconPos} top-1/2 -translate-y-1/2 text-slate-500`}>{icon}</span>}
        <span className={selected ? 'text-white' : 'text-slate-600'}>
          {selected?.label ?? placeholder ?? 'Select...'}
        </span>
        <ChevronDown
          size={size === 'sm' ? 13 : 15}
          className={`absolute ${chevronPos} top-1/2 -translate-y-1/2 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div
            ref={listRef}
            role="listbox"
            className={`absolute left-0 top-full mt-1.5 z-50 glass-strong rounded-xl shadow-2xl py-1.5 max-h-56 overflow-y-auto animate-scale-in ${
              size === 'sm' ? 'min-w-[180px]' : 'right-0'
            }`}
          >
            {options.map((opt, i) => (
              <button
                key={opt.value}
                type="button"
                data-idx={i}
                role="option"
                aria-selected={opt.value === value}
                onMouseEnter={() => setHighlighted(i)}
                onClick={() => { onChange(opt.value); close(); }}
                className={`w-full flex items-center justify-between gap-2 px-3.5 py-2 text-sm text-left transition-smooth ${
                  i === highlighted ? 'bg-white/8 text-white' : 'text-slate-300'
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {opt.value === value && <Check size={14} className="text-teal-400 flex-shrink-0" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
