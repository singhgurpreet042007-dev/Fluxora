import { getInitials, avatarColor } from '../lib/utils';

interface AvatarProps {
  name: string | null | undefined;
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

export function Avatar({ name, src, size = 'md', className = '' }: AvatarProps) {
  const sizes = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
  };

  if (src) {
    return (
      <img
        src={src}
        alt={name || 'Avatar'}
        className={`${sizes[size]} rounded-full object-cover ring-2 ring-white/10 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizes[size]} rounded-full bg-gradient-to-br ${avatarColor(
        name || '?'
      )} flex items-center justify-center font-semibold text-white ring-2 ring-white/10 ${className}`}
    >
      {getInitials(name)}
    </div>
  );
}
