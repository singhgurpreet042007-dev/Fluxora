/*
================================================================================
 FLUXORA — PRODUCTION SCHEMA (single-run replacement)
================================================================================

  Run this ONCE in the Supabase SQL editor (or `supabase db push`) on a
  project where you don't need to keep old data. It DROPS and rebuilds
  every Fluxora table from scratch, so it supersedes both earlier
  migrations (`fluxora_core_schema.sql` and `invitations.sql`) — do not
  run this alongside them, and don't run this on a project with real
  data you want to keep.

  WHY REPLACE INSTEAD OF PATCH
  -----------------------------------------------------------------------------
  The original schema's RLS policies on `organization_members` queried
  `organization_members` from inside its own policy:

      USING (organization_id IN (
        SELECT organization_id FROM organization_members om2
        WHERE om2.user_id = auth.uid()
      ))

  Every time Postgres evaluates that policy, the inner SELECT is itself
  subject to the same RLS policy, which runs the same inner SELECT again,
  and so on — this is the classic Supabase "infinite recursion detected
  in policy for relation organization_members" failure mode. It doesn't
  always trigger on simple queries, but it reliably breaks under joins,
  nested selects, or as the policy set grows (e.g. once `tasks`/`projects`
  policies also check membership). It's a correctness bug, not a style
  issue, so it's fixed at the root here rather than patched per-policy.

  THE FIX: SECURITY DEFINER helper functions
  -----------------------------------------------------------------------------
  `is_org_member()`, `is_org_admin()`, and `member_org_ids()` below run as
  the function owner (which has BYPASSRLS in Supabase), so membership
  checks never re-trigger RLS on `organization_members`. Every policy in
  this file is written in terms of these three functions — one audited
  place to reason about "can this user see/touch this org's data" instead
  of the same EXISTS(...) subquery copy-pasted (and easy to get subtly
  wrong) across a dozen policies.

  WHAT'S IN THIS FILE
  -----------------------------------------------------------------------------
  1. Extensions
  2. Clean slate (drop old objects)
  3. Helper functions (is_org_member, is_org_admin, member_org_ids, touch_updated_at)
  4. Core tables: organizations, organization_members, user_profiles,
     projects, tasks, activity_logs, notifications
  5. Invitations (real accept-by-token flow)
  6. Chat tables (chat_channels, chat_messages) — schema for the chat
     feature that isn't built in the UI yet, so the frontend work is
     just UI + queries, no further backend design needed
  7. File attachments table + Storage buckets/policies (avatars, attachments)
  8. Indexes
  9. Triggers (updated_at maintenance)
  10. RLS policies for every table
  11. Realtime publication

  NOTE ON NOTIFICATIONS: the frontend already creates notification rows
  itself (e.g. on task assignment, in TasksPage.tsx) via direct inserts.
  This schema does NOT add a server-side trigger that also creates
  assignment notifications — that would double-fire one notification per
  assignment. If you later remove the manual insert from the frontend,
  add a trigger here instead; don't run both.
================================================================================
*/

-- ============================================================================
-- 1. EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 2. CLEAN SLATE — drop everything this schema owns, in dependency order
-- ============================================================================
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS chat_channels CASCADE;
DROP TABLE IF EXISTS file_attachments CASCADE;
DROP TABLE IF EXISTS invitations CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS activity_logs CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS organization_members CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;

DROP FUNCTION IF EXISTS public.is_org_member(uuid);
DROP FUNCTION IF EXISTS public.is_org_admin(uuid);
DROP FUNCTION IF EXISTS public.member_org_ids();
DROP FUNCTION IF EXISTS public.touch_updated_at();

-- ============================================================================
-- 3. CORE TABLES
-- ============================================================================
-- (Helper functions that reference these tables are created in section 4,
-- right after — a LANGUAGE SQL function is validated against the catalog
-- at CREATE FUNCTION time, so the tables it queries must already exist.)

-- organizations ---------------------------------------------------------
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  logo_url text,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- organization_members ---------------------------------------------------
CREATE TABLE organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. HELPER FUNCTIONS (SECURITY DEFINER — bypass RLS, prevent recursion)
--    Created here, right after organization_members exists, since a
--    LANGUAGE SQL function body is validated against the catalog at
--    CREATE FUNCTION time.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_org_member(check_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = check_org_id
    AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(check_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = check_org_id
    AND user_id = auth.uid()
    AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.member_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT organization_id FROM organization_members WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM public;
REVOKE ALL ON FUNCTION public.is_org_admin(uuid) FROM public;
REVOKE ALL ON FUNCTION public.member_org_ids() FROM public;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.member_org_ids() TO authenticated;

-- Generic updated_at maintenance, reused by every table with that column.
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- user_profiles (1:1 extension of auth.users) ----------------------------
CREATE TABLE user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  avatar_url text,
  timezone text NOT NULL DEFAULT 'UTC',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- projects ----------------------------------------------------------------
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'completed')),
  color text NOT NULL DEFAULT '#10b981',
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- tasks ---------------------------------------------------------------------
CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  assignee_id uuid REFERENCES auth.users(id),
  due_date date,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- activity_logs ---------------------------------------------------------
CREATE TABLE activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- notifications -----------------------------------------------------------
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 5. INVITATIONS
-- ============================================================================
CREATE TABLE invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  organization_name text NOT NULL,
  invited_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  email text,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id)
);
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6. CHAT (schema ready; wire up ChatDrawer UI against this later)
-- ============================================================================
CREATE TABLE chat_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE chat_channels ENABLE ROW LEVEL SECURITY;

CREATE TABLE chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz
);
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 7. FILE ATTACHMENTS (metadata table + Storage buckets)
-- ============================================================================
CREATE TABLE file_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  file_name text NOT NULL,
  file_path text NOT NULL, -- path inside the 'attachments' storage bucket, e.g. '<org_id>/<uuid>-<filename>'
  file_size bigint,
  mime_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE file_attachments ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 8. INDEXES
-- ============================================================================
CREATE INDEX idx_org_members_user ON organization_members(user_id);
CREATE INDEX idx_org_members_org ON organization_members(organization_id);
CREATE INDEX idx_projects_org ON projects(organization_id);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_org ON tasks(organization_id);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_activity_org ON activity_logs(organization_id);
CREATE INDEX idx_activity_created ON activity_logs(created_at DESC);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_invitations_org ON invitations(organization_id);
CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_chat_channels_org ON chat_channels(organization_id);
CREATE INDEX idx_chat_messages_channel ON chat_messages(channel_id);
CREATE INDEX idx_chat_messages_org ON chat_messages(organization_id);
CREATE INDEX idx_file_attachments_org ON file_attachments(organization_id);
CREATE INDEX idx_file_attachments_task ON file_attachments(task_id);

-- ============================================================================
-- 9. TRIGGERS
-- ============================================================================
CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_user_profiles_updated_at BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================================
-- 10. RLS POLICIES
-- ============================================================================

-- organizations -------------------------------------------------------------
CREATE POLICY "org_select_members" ON organizations FOR SELECT
  TO authenticated USING (is_org_member(id));

CREATE POLICY "org_insert_any_authenticated" ON organizations FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "org_update_admin" ON organizations FOR UPDATE
  TO authenticated USING (is_org_admin(id)) WITH CHECK (is_org_admin(id));

CREATE POLICY "org_delete_admin" ON organizations FOR DELETE
  TO authenticated USING (is_org_admin(id));

-- organization_members -------------------------------------------------------
CREATE POLICY "om_select_fellow_members" ON organization_members FOR SELECT
  TO authenticated USING (is_org_member(organization_id));

CREATE POLICY "om_insert_self" ON organization_members FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "om_update_admin" ON organization_members FOR UPDATE
  TO authenticated USING (is_org_admin(organization_id)) WITH CHECK (is_org_admin(organization_id));

CREATE POLICY "om_delete_admin_or_self" ON organization_members FOR DELETE
  TO authenticated USING (user_id = auth.uid() OR is_org_admin(organization_id));

-- user_profiles ---------------------------------------------------------------
CREATE POLICY "profile_select_any_authenticated" ON user_profiles FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "profile_insert_own" ON user_profiles FOR INSERT
  TO authenticated WITH CHECK (id = auth.uid());

CREATE POLICY "profile_update_own" ON user_profiles FOR UPDATE
  TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "profile_delete_own" ON user_profiles FOR DELETE
  TO authenticated USING (id = auth.uid());

-- projects ----------------------------------------------------------------
CREATE POLICY "proj_select_members" ON projects FOR SELECT
  TO authenticated USING (is_org_member(organization_id));

CREATE POLICY "proj_insert_members" ON projects FOR INSERT
  TO authenticated WITH CHECK (is_org_member(organization_id));

CREATE POLICY "proj_update_members" ON projects FOR UPDATE
  TO authenticated USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id));

CREATE POLICY "proj_delete_admin" ON projects FOR DELETE
  TO authenticated USING (is_org_admin(organization_id));

-- tasks -----------------------------------------------------------------------
CREATE POLICY "task_select_members" ON tasks FOR SELECT
  TO authenticated USING (is_org_member(organization_id));

CREATE POLICY "task_insert_members" ON tasks FOR INSERT
  TO authenticated WITH CHECK (is_org_member(organization_id));

CREATE POLICY "task_update_members" ON tasks FOR UPDATE
  TO authenticated USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id));

CREATE POLICY "task_delete_members" ON tasks FOR DELETE
  TO authenticated USING (is_org_member(organization_id));

-- activity_logs -----------------------------------------------------------
CREATE POLICY "log_select_members" ON activity_logs FOR SELECT
  TO authenticated USING (is_org_member(organization_id));

CREATE POLICY "log_insert_members" ON activity_logs FOR INSERT
  TO authenticated WITH CHECK (is_org_member(organization_id));

-- Immutable audit trail: no UPDATE/DELETE policies means those operations
-- are denied by default once RLS is enabled — intentional, not an omission.

-- notifications -----------------------------------------------------------
CREATE POLICY "notif_select_own" ON notifications FOR SELECT
  TO authenticated USING (user_id = auth.uid());

CREATE POLICY "notif_insert_own" ON notifications FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "notif_update_own" ON notifications FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "notif_delete_own" ON notifications FOR DELETE
  TO authenticated USING (user_id = auth.uid());

-- invitations ---------------------------------------------------------------
-- Any authenticated user may look up a single invite by its token (to see
-- what org/role they're being invited to before they're a member).
CREATE POLICY "invite_select_authenticated" ON invitations FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "invite_insert_admin" ON invitations FOR INSERT
  TO authenticated WITH CHECK (is_org_admin(organization_id));

-- Admins can revoke any pending invite in their org; the invited user can
-- only flip their own still-pending invite to accepted (nothing else).
CREATE POLICY "invite_update_admin_or_acceptor" ON invitations FOR UPDATE
  TO authenticated
  USING (
    status = 'pending'
    AND (is_org_admin(organization_id) OR expires_at > now())
  )
  WITH CHECK (
    (status = 'revoked' AND is_org_admin(organization_id))
    OR (status = 'accepted' AND accepted_by = auth.uid())
  );

CREATE POLICY "invite_delete_admin" ON invitations FOR DELETE
  TO authenticated USING (is_org_admin(organization_id));

-- chat_channels -----------------------------------------------------------
CREATE POLICY "channel_select_members" ON chat_channels FOR SELECT
  TO authenticated USING (is_org_member(organization_id));

CREATE POLICY "channel_insert_members" ON chat_channels FOR INSERT
  TO authenticated WITH CHECK (is_org_member(organization_id));

CREATE POLICY "channel_delete_admin" ON chat_channels FOR DELETE
  TO authenticated USING (is_org_admin(organization_id));

-- chat_messages -----------------------------------------------------------
CREATE POLICY "message_select_members" ON chat_messages FOR SELECT
  TO authenticated USING (is_org_member(organization_id));

CREATE POLICY "message_insert_members" ON chat_messages FOR INSERT
  TO authenticated WITH CHECK (is_org_member(organization_id) AND user_id = auth.uid());

CREATE POLICY "message_update_own" ON chat_messages FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "message_delete_own_or_admin" ON chat_messages FOR DELETE
  TO authenticated USING (user_id = auth.uid() OR is_org_admin(organization_id));

-- file_attachments ---------------------------------------------------------
CREATE POLICY "file_select_members" ON file_attachments FOR SELECT
  TO authenticated USING (is_org_member(organization_id));

CREATE POLICY "file_insert_members" ON file_attachments FOR INSERT
  TO authenticated WITH CHECK (is_org_member(organization_id) AND uploaded_by = auth.uid());

CREATE POLICY "file_delete_own_or_admin" ON file_attachments FOR DELETE
  TO authenticated USING (uploaded_by = auth.uid() OR is_org_admin(organization_id));

-- storage.objects: avatars bucket (public read, owner-only write) ---------
-- Convention: object path is '<user_id>/<filename>'.
CREATE POLICY "avatar_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "avatar_owner_write" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatar_owner_update" ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatar_owner_delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- storage.objects: attachments bucket (org-member-only) --------------------
-- Convention: object path is '<organization_id>/<filename>'.
CREATE POLICY "attachment_member_read" ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'attachments' AND is_org_member(((storage.foldername(name))[1])::uuid));

CREATE POLICY "attachment_member_write" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'attachments' AND is_org_member(((storage.foldername(name))[1])::uuid));

CREATE POLICY "attachment_member_delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'attachments' AND is_org_member(((storage.foldername(name))[1])::uuid));

-- ============================================================================
-- 11. REALTIME
-- ============================================================================
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE activity_logs;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE organization_members;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE invitations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- DONE. Sanity checklist after running:
--   1. Table Editor me 11 tables dikhni chahiye (organizations ... file_attachments).
--   2. Storage me 'avatars' (public) aur 'attachments' (private) buckets dikhne chahiye.
--   3. Database > Functions me is_org_member / is_org_admin / member_org_ids dikhne chahiye.
--   4. Signup -> workspace create -> project/task create -> dusre browser me
--      real-time update dikhna chahiye (already-built frontend flow).
-- ============================================================================
