import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';
import type { Org, OrgMember } from './types';

interface OrgContextValue {
  orgs: Org[];
  currentOrg: Org | null;
  membership: OrgMember | null;
  loading: boolean;
  setCurrentOrg: (org: Org) => void;
  refreshOrgs: () => Promise<void>;
  createOrg: (name: string) => Promise<{ error: string | null; org: Org | null }>;
}

const OrgContext = createContext<OrgContextValue | undefined>(undefined);

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') +
    '-' +
    Math.random().toString(36).slice(2, 6)
  );
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


    const { data: memberships, error: memberError } = await supabase
      .from('organization_members')
      .select('organization_id, role, id, user_id, joined_at')
      .eq('user_id', user.id);


    if (memberError) {
      console.error('Membership fetch error:', memberError);
      setLoading(false);
      return;
    }


    if (!memberships || memberships.length === 0) {
      setOrgs([]);
      setCurrentOrgState(null);
      setMembership(null);
      setLoading(false);
      return;
    }


    const orgIds = memberships.map(
      (m) => m.organization_id
    );


    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .in('id', orgIds);


    if (orgError) {
      console.error('Organization fetch error:', orgError);
      setLoading(false);
      return;
    }


    const validOrgs = (orgData || []) as Org[];

    setOrgs(validOrgs);


    const stored = localStorage.getItem(
      'fluxora_current_org'
    );


    const found = stored
      ? validOrgs.find(
          (o) => o.id === stored
        )
      : null;


    const next = found || validOrgs[0] || null;


    setCurrentOrgState(next);


    if (next) {
      const mem = (
        memberships as OrgMember[]
      ).find(
        (m) =>
          m.organization_id === next.id
      );

      setMembership(mem || null);
    }


    setLoading(false);

  }, [user]);



  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);



  const setCurrentOrg = useCallback(
    (org: Org) => {

      setCurrentOrgState(org);

      localStorage.setItem(
        'fluxora_current_org',
        org.id
      );


      if (user) {

        supabase
          .from('organization_members')
          .select('*')
          .eq(
            'organization_id',
            org.id
          )
          .eq(
            'user_id',
            user.id
          )
          .maybeSingle()
          .then(({ data }) => {

            setMembership(
              data as OrgMember | null
            );

          });

      }

    },
    [user]
  );



  const createOrg = useCallback(
    async (name: string) => {

      if (!user) {
        return {
          error: 'Not authenticated',
          org: null
        };
      }


      const slug = slugify(name);



      const {
        data: org,
        error
      } = await supabase
        .from('organizations')
        .insert({

          name,

          slug,

          owner_id: user.id

        })
        .select('*')
        .single();



      if (error || !org) {

        console.error(
          'Create organization error:',
          error
        );


        return {

          error:
            error?.message ??
            'Failed to create organization',

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


    },
    [
      user,
      fetchOrgs,
      setCurrentOrg
    ]
  );



  return (

    <OrgContext.Provider
      value={{

        orgs,

        currentOrg,

        membership,

        loading,

        setCurrentOrg,

        refreshOrgs:
          fetchOrgs,

        createOrg

      }}
    >

      {children}

    </OrgContext.Provider>

  );

}



export function useOrg() {

  const ctx = useContext(
    OrgContext
  );


  if (!ctx) {

    throw new Error(
      'useOrg must be used within OrgProvider'
    );

  }


  return ctx;

}

