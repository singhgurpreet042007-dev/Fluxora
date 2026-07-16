import { supabase } from './supabase';
import type { ActivityLog } from './types';

export async function logActivity(
  organizationId: string,
  userId: string,
  action: string,
  entityType: string,
  entityId: string | null = null,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    await supabase.from('activity_logs').insert({
      organization_id: organizationId,
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata,
    });
  } catch {
    // Non-blocking — activity logging is best-effort
  }
}

export async function createNotification(
  userId: string,
  organizationId: string | null,
  title: string,
  message: string
): Promise<void> {
  try {
    await supabase.from('notifications').insert({
      user_id: userId,
      organization_id: organizationId,
      title,
      message,
    });
  } catch {
    // best-effort
  }
}

export function formatRelativeTime(date: string): string {
  const now = new Date();
  const past = new Date(date);
  const diff = now.getTime() - past.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return past.toLocaleDateString();
}

export function formatLogAction(log: ActivityLog): string {
  const map: Record<string, string> = {
    created: 'created',
    updated: 'updated',
    deleted: 'deleted',
    completed: 'completed',
    assigned: 'assigned to',
    status_changed: 'changed status of',
    joined: 'joined',
  };
  return map[log.action] || log.action;
}

export function priorityColor(priority: string): { bg: string; text: string; dot: string } {
  switch (priority) {
    case 'urgent': return { bg: 'bg-rose-500/10', text: 'text-rose-400', dot: 'status-dot urgent' };
    case 'high': return { bg: 'bg-orange-500/10', text: 'text-orange-400', dot: 'bg-orange-400' };
    case 'medium': return { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' };
    case 'low': return { bg: 'bg-teal-500/10', text: 'text-teal-400', dot: 'bg-teal-400' };
    default: return { bg: 'bg-slate-500/10', text: 'text-slate-400', dot: 'bg-slate-400' };
  }
}

export function statusColor(status: string): { bg: string; text: string; dot: string } {
  switch (status) {
    case 'done': return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'status-dot done' };
    case 'in_progress': return { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'status-dot in_progress' };
    case 'review': return { bg: 'bg-violet-500/10', text: 'text-violet-400', dot: 'status-dot review' };
    case 'todo': return { bg: 'bg-slate-500/10', text: 'text-slate-400', dot: 'status-dot todo' };
    case 'active': return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'status-dot active' };
    case 'archived': return { bg: 'bg-slate-500/10', text: 'text-slate-400', dot: 'status-dot todo' };
    case 'completed': return { bg: 'bg-teal-500/10', text: 'text-teal-400', dot: 'status-dot done' };
    default: return { bg: 'bg-slate-500/10', text: 'text-slate-400', dot: 'status-dot todo' };
  }
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function avatarColor(seed: string): string {
  const colors = [
    'from-teal-500 to-emerald-500',
    'from-amber-500 to-orange-500',
    'from-rose-500 to-pink-500',
    'from-violet-500 to-purple-500',
    'from-cyan-500 to-blue-500',
    'from-lime-500 to-green-500',
  ];
  const hash = seed.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return colors[hash % colors.length];
}
