import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../lib/auth';
import { useOrg } from '../lib/org';
import { useToast } from '../lib/toast';
import { supabase } from '../lib/supabase';
import { Avatar } from './Avatar';
import { Spinner } from './Loader';
import { formatRelativeTime } from '../lib/utils';
import type { ChatChannel, ChatMessage, UserProfile } from '../lib/types';
import { X, Send, Hash, Plus, MessageSquare } from 'lucide-react';

interface ChatDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function ChatDrawer({ open, onClose }: ChatDrawerProps) {
  const { user } = useAuth();
  const { currentOrg, membership } = useOrg();
  const { show } = useToast();

  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChannel, setActiveChannel] = useState<ChatChannel | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [draft, setDraft] = useState('');
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchChannels = useCallback(async () => {
    if (!currentOrg) return;
    setLoadingChannels(true);
    const { data, error } = await supabase
      .from('chat_channels')
      .select('*')
      .eq('organization_id', currentOrg.id)
      .order('created_at', { ascending: true });

    if (error) show('error', 'Could not load channels', error.message);
    const list = (data as ChatChannel[]) || [];
    setChannels(list);
    setActiveChannel((prev) => prev && list.some((c) => c.id === prev.id) ? prev : list[0] || null);
    setLoadingChannels(false);
  }, [currentOrg, show]);

  const fetchProfilesFor = useCallback(async (userIds: string[]) => {
    const missing = [...new Set(userIds)].filter((id) => !profiles[id]);
    if (missing.length === 0) return;
    const { data } = await supabase.from('user_profiles').select('*').in('id', missing);
    if (data) {
      setProfiles((prev) => {
        const next = { ...prev };
        (data as UserProfile[]).forEach((p) => { next[p.id] = p; });
        return next;
      });
    }
  }, [profiles]);

  const fetchMessages = useCallback(async (channelId: string) => {
    setLoadingMessages(true);
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true })
      .limit(200);

    if (error) show('error', 'Could not load messages', error.message);
    const list = (data as ChatMessage[]) || [];
    setMessages(list);
    await fetchProfilesFor(list.map((m) => m.user_id));
    setLoadingMessages(false);
  }, [show, fetchProfilesFor]);

  useEffect(() => {
    if (open && currentOrg) fetchChannels();
  }, [open, currentOrg, fetchChannels]);

  useEffect(() => {
    if (activeChannel) fetchMessages(activeChannel.id);
    else setMessages([]);
  }, [activeChannel, fetchMessages]);

  // Realtime: new messages in the active channel
  useEffect(() => {
    if (!open || !activeChannel) return;
    const channel = supabase
      .channel(`chat-messages-${activeChannel.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${activeChannel.id}` },
        (payload) => {
          const msg = payload.new as ChatMessage;
          setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
          fetchProfilesFor([msg.user_id]);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [open, activeChannel, fetchProfilesFor]);

  // Realtime: channel list changes
  useEffect(() => {
    if (!open || !currentOrg) return;
    const channel = supabase
      .channel('chat-channels-realtime')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_channels', filter: `organization_id=eq.${currentOrg.id}` },
        () => { fetchChannels(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [open, currentOrg, fetchChannels]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleCreateChannel = async () => {
    if (!currentOrg || !user || !newChannelName.trim()) return;
    const { data, error } = await supabase
      .from('chat_channels')
      .insert({ organization_id: currentOrg.id, name: newChannelName.trim(), created_by: user.id })
      .select('*')
      .single();

    if (error || !data) {
      show('error', 'Failed to create channel', error?.message);
      return;
    }
    show('success', 'Channel created');
    setNewChannelName('');
    setShowNewChannel(false);
    await fetchChannels();
    setActiveChannel(data as ChatChannel);
  };

  const handleSend = async () => {
    if (!draft.trim() || !activeChannel || !currentOrg || !user) return;
    setSending(true);
    const content = draft.trim();
    setDraft('');
    const { error } = await supabase.from('chat_messages').insert({
      channel_id: activeChannel.id,
      organization_id: currentOrg.id,
      user_id: user.id,
      content,
    });
    if (error) {
      show('error', 'Message failed to send', error.message);
      setDraft(content);
    }
    setSending(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md h-full glass-strong border-l border-white/10 flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/8">
          <div className="flex items-center gap-2">
            <MessageSquare size={18} className="text-teal-400" />
            <h3 className="text-sm font-semibold text-white">Team Chat</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-smooth">
            <X size={18} />
          </button>
        </div>

        {/* Channel tabs */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/8 overflow-x-auto">
          {loadingChannels ? (
            <div className="px-2 py-1"><Spinner size={14} /></div>
          ) : (
            channels.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveChannel(c)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap transition-smooth ${
                  activeChannel?.id === c.id ? 'bg-teal-500/20 text-teal-300' : 'text-slate-400 hover:bg-white/5'
                }`}
              >
                <Hash size={11} /> {c.name}
              </button>
            ))
          )}
          <button
            onClick={() => setShowNewChannel((v) => !v)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-teal-400 hover:bg-white/5 transition-smooth flex-shrink-0"
            title="New channel"
          >
            <Plus size={14} />
          </button>
        </div>

        {showNewChannel && (
          <div className="flex gap-2 px-3 py-2 border-b border-white/8">
            <input
              type="text"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              placeholder="channel-name"
              className="input-field flex-1 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-600"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreateChannel()}
            />
            <button onClick={handleCreateChannel} disabled={!newChannelName.trim()} className="btn-primary px-3 py-1.5 rounded-lg text-xs disabled:opacity-50">
              Create
            </button>
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {!activeChannel ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 text-sm gap-2">
              <Hash size={24} className="opacity-30" />
              {loadingChannels ? 'Loading...' : 'No channels yet — create one to start chatting.'}
            </div>
          ) : loadingMessages ? (
            <div className="flex justify-center py-8"><Spinner size={20} /></div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 text-sm gap-2">
              <MessageSquare size={24} className="opacity-30" />
              No messages yet. Say hello!
            </div>
          ) : (
            messages.map((m) => {
              const prof = profiles[m.user_id];
              const isYou = m.user_id === user?.id;
              return (
                <div key={m.id} className={`flex gap-2.5 ${isYou ? 'flex-row-reverse' : ''}`}>
                  <Avatar name={prof?.full_name} src={prof?.avatar_url} size="xs" className="mt-0.5 flex-shrink-0" />
                  <div className={`max-w-[75%] ${isYou ? 'items-end' : 'items-start'} flex flex-col`}>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[11px] text-slate-500">{isYou ? 'You' : prof?.full_name || 'Member'}</span>
                      <span className="text-[10px] text-slate-600">{formatRelativeTime(m.created_at)}</span>
                    </div>
                    <div className={`rounded-2xl px-3 py-2 text-sm ${
                      isYou ? 'bg-teal-500/20 text-teal-100' : 'bg-white/5 text-slate-200'
                    }`}>
                      {m.content}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Composer */}
        <div className="p-3 border-t border-white/8">
          <div className="flex gap-2 items-end">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={activeChannel ? `Message #${activeChannel.name}` : 'Select a channel'}
              disabled={!activeChannel}
              rows={1}
              className="input-field flex-1 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 resize-none disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!draft.trim() || !activeChannel || sending}
              className="btn-primary p-2.5 rounded-xl disabled:opacity-50 flex-shrink-0"
            >
              {sending ? <Spinner size={16} /> : <Send size={16} />}
            </button>
          </div>
          {!membership && (
            <p className="text-[10px] text-slate-600 mt-1.5">Join a workspace to start chatting.</p>
          )}
        </div>
      </div>
    </div>
  );
}