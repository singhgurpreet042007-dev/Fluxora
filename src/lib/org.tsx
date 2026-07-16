import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';
import type { Org, OrgMember, Invitation } from './types';

interface OrgContextValue {
  orgs: Org[];
  currentOrg: Org | null;
  membership: OrgMember | null;
  loading: boolean;
  setCurrentOrg: (org: Org) => void;
  refreshOrgs: () => Promise<void>;
  createOrg: (name: string) => Promise<{ error: string | null; org: Org | null }>;
  getInviteByToken: (token: string) => Promise<{ invite: Invitation | null; error: string | null }>;
  acceptInvite: (invite: Invitation) => Promise<{ error: string | null }>;
}

const OrgContext = createContext<OrgContextValue | undefined>(undefined);

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '-' + Math.random().toString(36).slice(2, 6);
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [currentOrg, setCurrentOrgState] = useState<Org | null>(null);
  const [membership, setMembership] = useState<OrgMember | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOrgs = useCallback(async () => {
    if (!user) {
      setOrgs([]);
      setCurrentOrgState(null);
      setMembership(null);
      setLoading(false);
      return;
    }
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id, role, id, user_id, joined_at')
      .eq('user_id', user.id);

    if (!memberships || memberships.length === 0) {
      setOrgs([]);
      setCurrentOrgState(null);
      setMembership(null);
      setLoading(false);
      return;
    }

    const orgIds = memberships.map((m) => m.organization_id);
    const { data: orgData } = await supabase
      .from('organizations')
      .select('*')
      .in('id', orgIds);

    const validOrgs = (orgData || []) as Org[];
    setOrgs(validOrgs);

    const stored = localStorage.getItem('fluxora_current_org');
    const found = stored ? validOrgs.find((o) => o.id === stored) : null;
    const next = found || validOrgs[0] || null;
    setCurrentOrgState(next);
    if (next) {
      const mem = (memberships as OrgMember[]).find((m) => m.organization_id === next.id);
      setMembership(mem || null);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  const setCurrentOrg = useCallback((org: Org) => {
    setCurrentOrgState(org);
    localStorage.setItem('fluxora_current_org', org.id);
    if (user) {
      supabase
        .from('organization_members')
        .select('*')
        .eq('organization_id', org.id)
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data }) => setMembership(data as OrgMember | null));
    }
  }, [user]);

const createOrg = useCallback(async (name: string) => {
  if (!user) return { error: 'Not authenticated', org: null };

  const slug = slugify(name);

  const { data: org, error } = await supabase
    .from('organizations')
    .insert({
      name,
      slug,
      owner_id: user.id
    })
    .select('*')
    .single();

  if (error || !org) {
    return { 
      error: error?.message ?? 'Failed to create', 
      org: null 
    };
  }

  const newOrg = org as Org;

  await fetchOrgs();
  setCurrentOrg(newOrg);

  return { 
    error: null, 
    org: newOrg 
  };

}, [user, fetchOrgs, setCurrentOrg]);

  const getInviteByToken = useCallback(async (token: string) => {
    const { data, error } = await supabase
      .from('invitations')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (error) return { invite: null, error: error.message };
    if (!data) return { invite: null, error: 'This invite link is invalid.' };

    const invite = data as Invitation;
    if (invite.status === 'revoked') return { invite: null, error: 'This invite has been revoked.' };
    if (invite.status === 'accepted') return { invite: null, error: 'This invite has already been used.' };
    if (new Date(invite.expires_at) < new Date()) return { invite: null, error: 'This invite has expired.' };

    return { invite, error: null };
  }, []);

  const acceptInvite = useCallback(async (invite: Invitation) => {
    if (!user) return { error: 'Not authenticated' };

    const { error: memError } = await supabase
      .from('organization_members')
      .insert({ organization_id: invite.organization_id, user_id: user.id, role: invite.role });

    if (memError) {
      // Already a member of this org — treat as success and just mark the invite used.
      if (memError.code !== '23505') return { error: memError.message };
    }

    const { error: updateError } = await supabase
      .from('invitations')
      .update({ status: 'accepted', accepted_at: new Date().toISOString(), accepted_by: user.id })
      .eq('id', invite.id);

    if (updateError) return { error: updateError.message };

    await fetchOrgs();
    return { error: null };
  }, [user, fetchOrgs]);

  return (
    <OrgContext.Provider value={{ orgs, currentOrg, membership, loading, setCurrentOrg, refreshOrgs: fetchOrgs, createOrg, getInviteByToken, acceptInvite }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within OrgProvider');
  return ctx;
}