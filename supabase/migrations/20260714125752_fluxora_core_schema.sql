-- ============================================================
-- FLUXORA PRODUCTION SUPABASE SETUP
-- PART 1/3
-- Core Schema + Security Functions
-- ============================================================


-- ==============================
-- CLEAN RESET
-- ==============================

DROP TABLE IF EXISTS
chat_messages,
chat_channels,
file_attachments,
invitations,
notifications,
activity_logs,
tasks,
projects,
organization_members,
user_profiles,
organizations
CASCADE;


DROP FUNCTION IF EXISTS
public.is_org_member(uuid),
public.is_org_admin(uuid),
public.add_org_owner(),
public.touch_updated_at()
CASCADE;


CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ==============================
-- ORGANIZATIONS
-- ==============================

CREATE TABLE organizations (

    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    name text NOT NULL,

    slug text UNIQUE NOT NULL,

    owner_id uuid 
    REFERENCES auth.users(id)
    ON DELETE CASCADE,

    logo_url text,

    plan text NOT NULL DEFAULT 'free'
    CHECK(plan IN ('free','pro','enterprise')),

    created_at timestamptz DEFAULT now(),

    updated_at timestamptz DEFAULT now()

);


ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;



-- ==============================
-- ORGANIZATION MEMBERS
-- ==============================

CREATE TABLE organization_members (

    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    organization_id uuid NOT NULL
    REFERENCES organizations(id)
    ON DELETE CASCADE,


    user_id uuid NOT NULL
    REFERENCES auth.users(id)
    ON DELETE CASCADE,


    role text NOT NULL DEFAULT 'member'
    CHECK(role IN ('admin','member')),


    joined_at timestamptz DEFAULT now(),


    UNIQUE(
        organization_id,
        user_id
    )

);


ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;



-- ==============================
-- USER PROFILES
-- ==============================

CREATE TABLE user_profiles (

    id uuid PRIMARY KEY
    REFERENCES auth.users(id)
    ON DELETE CASCADE,


    full_name text,


    avatar_url text,


    timezone text DEFAULT 'UTC',


    updated_at timestamptz DEFAULT now()

);


ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;



-- ==============================
-- PROJECTS
-- ==============================

CREATE TABLE projects (

    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),


    organization_id uuid NOT NULL
    REFERENCES organizations(id)
    ON DELETE CASCADE,


    name text NOT NULL,


    description text,


    status text DEFAULT 'active'
    CHECK(status IN
    ('active','archived','completed')),


    color text DEFAULT '#10b981',


    created_by uuid DEFAULT auth.uid()
    REFERENCES auth.users(id),


    created_at timestamptz DEFAULT now(),


    updated_at timestamptz DEFAULT now()

);


ALTER TABLE projects ENABLE ROW LEVEL SECURITY;



-- ==============================
-- TASKS
-- ==============================

CREATE TABLE tasks (

    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),


    project_id uuid NOT NULL
    REFERENCES projects(id)
    ON DELETE CASCADE,


    organization_id uuid NOT NULL
    REFERENCES organizations(id)
    ON DELETE CASCADE,


    title text NOT NULL,


    description text,


    status text DEFAULT 'todo'
    CHECK(status IN
    ('todo','in_progress','review','done')),


    priority text DEFAULT 'medium'
    CHECK(priority IN
    ('low','medium','high','urgent')),


    assignee_id uuid
    REFERENCES auth.users(id),


    due_date date,


    created_by uuid DEFAULT auth.uid()
    REFERENCES auth.users(id),


    created_at timestamptz DEFAULT now(),


    updated_at timestamptz DEFAULT now()

);


ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;



-- ==============================
-- ACTIVITY LOGS
-- ==============================

CREATE TABLE activity_logs (

    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),


    organization_id uuid NOT NULL
    REFERENCES organizations(id)
    ON DELETE CASCADE,


    user_id uuid NOT NULL
    REFERENCES auth.users(id),


    action text NOT NULL,


    entity_type text NOT NULL,


    entity_id uuid,


    metadata jsonb DEFAULT '{}',


    created_at timestamptz DEFAULT now()

);


ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;



-- ==============================
-- NOTIFICATIONS
-- ==============================

CREATE TABLE notifications (

    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),


    user_id uuid NOT NULL
    REFERENCES auth.users(id)
    ON DELETE CASCADE,


    organization_id uuid
    REFERENCES organizations(id)
    ON DELETE CASCADE,


    title text NOT NULL,


    message text NOT NULL,


    read boolean DEFAULT false,


    created_at timestamptz DEFAULT now()

);


ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;



-- ==============================
-- INVITATIONS
-- ==============================

CREATE TABLE invitations (

    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),


    organization_id uuid NOT NULL
    REFERENCES organizations(id)
    ON DELETE CASCADE,


    organization_name text NOT NULL,


    invited_by uuid DEFAULT auth.uid()
    REFERENCES auth.users(id),


    email text,


    role text DEFAULT 'member'
    CHECK(role IN ('admin','member')),


    token uuid DEFAULT gen_random_uuid()
    UNIQUE,


    status text DEFAULT 'pending'
    CHECK(status IN
    ('pending','accepted','revoked')),


    created_at timestamptz DEFAULT now(),


    expires_at timestamptz DEFAULT
    (now() + interval '7 days'),


    accepted_at timestamptz,


    accepted_by uuid
    REFERENCES auth.users(id)

);


ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;



-- ==============================
-- CHAT CHANNELS
-- ==============================

CREATE TABLE chat_channels (

    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),


    organization_id uuid NOT NULL
    REFERENCES organizations(id)
    ON DELETE CASCADE,


    project_id uuid
    REFERENCES projects(id)
    ON DELETE CASCADE,


    name text NOT NULL,


    created_by uuid DEFAULT auth.uid()
    REFERENCES auth.users(id),


    created_at timestamptz DEFAULT now()

);


ALTER TABLE chat_channels ENABLE ROW LEVEL SECURITY;



-- ==============================
-- CHAT MESSAGES
-- ==============================

CREATE TABLE chat_messages (

    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),


    channel_id uuid NOT NULL
    REFERENCES chat_channels(id)
    ON DELETE CASCADE,


    organization_id uuid NOT NULL
    REFERENCES organizations(id)
    ON DELETE CASCADE,


    user_id uuid DEFAULT auth.uid()
    REFERENCES auth.users(id),


    content text NOT NULL,


    created_at timestamptz DEFAULT now(),


    edited_at timestamptz

);


ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;



-- ==============================
-- FILE ATTACHMENTS
-- ==============================

CREATE TABLE file_attachments (

    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),


    organization_id uuid NOT NULL
    REFERENCES organizations(id)
    ON DELETE CASCADE,


    project_id uuid
    REFERENCES projects(id)
    ON DELETE CASCADE,


    task_id uuid
    REFERENCES tasks(id)
    ON DELETE CASCADE,


    uploaded_by uuid DEFAULT auth.uid()
    REFERENCES auth.users(id),


    file_name text NOT NULL,


    file_path text NOT NULL,


    file_size bigint,


    mime_type text,


    created_at timestamptz DEFAULT now()

);


ALTER TABLE file_attachments ENABLE ROW LEVEL SECURITY;



-- ==============================
-- SECURITY DEFINER FUNCTIONS
-- ==============================


CREATE OR REPLACE FUNCTION public.is_org_member(
check_org_id uuid
)

RETURNS boolean

LANGUAGE sql

SECURITY DEFINER

SET search_path = public

STABLE

AS $$

SELECT EXISTS(

    SELECT 1

    FROM organization_members

    WHERE organization_id = check_org_id

    AND user_id = auth.uid()

);

$$;



CREATE OR REPLACE FUNCTION public.is_org_admin(
check_org_id uuid
)

RETURNS boolean

LANGUAGE sql

SECURITY DEFINER

SET search_path = public

STABLE

AS $$

SELECT EXISTS(

    SELECT 1

    FROM organization_members

    WHERE organization_id = check_org_id

    AND user_id = auth.uid()

    AND role='admin'

);

$$;



REVOKE ALL ON FUNCTION public.is_org_member(uuid)
FROM public;


REVOKE ALL ON FUNCTION public.is_org_admin(uuid)
FROM public;


GRANT EXECUTE ON FUNCTION public.is_org_member(uuid)
TO authenticated;


GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid)
TO authenticated;


-- END PART 1
-- ============================================================
-- FLUXORA PRODUCTION SUPABASE SETUP
-- PART 2/3
-- Indexes + Triggers + RLS Policies
-- ============================================================


-- ============================================================
-- INDEXES
-- ============================================================


CREATE INDEX idx_org_owner
ON organizations(owner_id);


CREATE INDEX idx_members_user
ON organization_members(user_id);


CREATE INDEX idx_members_org
ON organization_members(organization_id);


CREATE INDEX idx_projects_org
ON projects(organization_id);


CREATE INDEX idx_tasks_project
ON tasks(project_id);


CREATE INDEX idx_tasks_org
ON tasks(organization_id);


CREATE INDEX idx_tasks_assignee
ON tasks(assignee_id);


CREATE INDEX idx_activity_org
ON activity_logs(organization_id);


CREATE INDEX idx_activity_created
ON activity_logs(created_at DESC);


CREATE INDEX idx_notifications_user
ON notifications(user_id);


CREATE INDEX idx_invites_org
ON invitations(organization_id);


CREATE INDEX idx_invites_token
ON invitations(token);


CREATE INDEX idx_channels_org
ON chat_channels(organization_id);


CREATE INDEX idx_messages_channel
ON chat_messages(channel_id);


CREATE INDEX idx_messages_org
ON chat_messages(organization_id);


CREATE INDEX idx_files_org
ON file_attachments(organization_id);



-- ============================================================
-- UPDATED AT FUNCTION
-- ============================================================


CREATE OR REPLACE FUNCTION public.touch_updated_at()

RETURNS trigger

LANGUAGE plpgsql

AS $$

BEGIN

NEW.updated_at = now();

RETURN NEW;

END;

$$;



CREATE TRIGGER organizations_updated_at

BEFORE UPDATE ON organizations

FOR EACH ROW

EXECUTE FUNCTION public.touch_updated_at();



CREATE TRIGGER profiles_updated_at

BEFORE UPDATE ON user_profiles

FOR EACH ROW

EXECUTE FUNCTION public.touch_updated_at();



CREATE TRIGGER projects_updated_at

BEFORE UPDATE ON projects

FOR EACH ROW

EXECUTE FUNCTION public.touch_updated_at();



CREATE TRIGGER tasks_updated_at

BEFORE UPDATE ON tasks

FOR EACH ROW

EXECUTE FUNCTION public.touch_updated_at();




-- ============================================================
-- AUTO ADD WORKSPACE OWNER AS ADMIN
-- ============================================================


CREATE OR REPLACE FUNCTION public.add_org_owner()

RETURNS trigger

LANGUAGE plpgsql

SECURITY DEFINER

SET search_path = public

AS $$

BEGIN


INSERT INTO organization_members
(
organization_id,
user_id,
role
)

VALUES

(
NEW.id,
NEW.owner_id,
'admin'
);


RETURN NEW;


END;

$$;



CREATE TRIGGER after_organization_created

AFTER INSERT ON organizations

FOR EACH ROW

EXECUTE FUNCTION public.add_org_owner();





-- ============================================================
-- ORGANIZATIONS RLS
-- ============================================================


CREATE POLICY "organizations_view"

ON organizations

FOR SELECT

TO authenticated

USING
(
owner_id = auth.uid()
OR
is_org_member(id)
);



CREATE POLICY "organizations_create"

ON organizations

FOR INSERT

TO authenticated

WITH CHECK
(
owner_id = auth.uid()
);



CREATE POLICY "organizations_update"

ON organizations

FOR UPDATE

TO authenticated

USING
(
is_org_admin(id)
)

WITH CHECK
(
is_org_admin(id)
);



CREATE POLICY "organizations_delete"

ON organizations

FOR DELETE

TO authenticated

USING
(
is_org_admin(id)
);




-- ============================================================
-- ORGANIZATION MEMBERS RLS
-- ============================================================


CREATE POLICY "members_view"

ON organization_members

FOR SELECT

TO authenticated

USING
(
is_org_member(organization_id)
);



CREATE POLICY "members_insert"

ON organization_members

FOR INSERT

TO authenticated

WITH CHECK
(
user_id = auth.uid()
OR
is_org_admin(organization_id)
);



CREATE POLICY "members_update"

ON organization_members

FOR UPDATE

TO authenticated

USING
(
is_org_admin(organization_id)
)

WITH CHECK
(
is_org_admin(organization_id)
);



CREATE POLICY "members_delete"

ON organization_members

FOR DELETE

TO authenticated

USING
(
user_id = auth.uid()
OR
is_org_admin(organization_id)
);




-- ============================================================
-- USER PROFILES
-- ============================================================


CREATE POLICY "profiles_read"

ON user_profiles

FOR SELECT

TO authenticated

USING(true);



CREATE POLICY "profiles_create"

ON user_profiles

FOR INSERT

TO authenticated

WITH CHECK
(
id = auth.uid()
);



CREATE POLICY "profiles_update"

ON user_profiles

FOR UPDATE

TO authenticated

USING
(
id = auth.uid()
)

WITH CHECK
(
id = auth.uid()
);




-- ============================================================
-- PROJECTS
-- ============================================================


CREATE POLICY "projects_read"

ON projects

FOR SELECT

TO authenticated

USING
(
is_org_member(organization_id)
);



CREATE POLICY "projects_create"

ON projects

FOR INSERT

TO authenticated

WITH CHECK
(
is_org_member(organization_id)
);



CREATE POLICY "projects_update"

ON projects

FOR UPDATE

TO authenticated

USING
(
is_org_member(organization_id)
);



CREATE POLICY "projects_delete"

ON projects

FOR DELETE

TO authenticated

USING
(
is_org_admin(organization_id)
);




-- ============================================================
-- TASKS
-- ============================================================


CREATE POLICY "tasks_read"

ON tasks

FOR SELECT

TO authenticated

USING
(
is_org_member(organization_id)
);



CREATE POLICY "tasks_create"

ON tasks

FOR INSERT

TO authenticated

WITH CHECK
(
is_org_member(organization_id)
);



CREATE POLICY "tasks_update"

ON tasks

FOR UPDATE

TO authenticated

USING
(
is_org_member(organization_id)
);



CREATE POLICY "tasks_delete"

ON tasks

FOR DELETE

TO authenticated

USING
(
is_org_member(organization_id)
);




-- ============================================================
-- ACTIVITY LOGS
-- ============================================================


CREATE POLICY "activity_read"

ON activity_logs

FOR SELECT

TO authenticated

USING
(
is_org_member(organization_id)
);



CREATE POLICY "activity_create"

ON activity_logs

FOR INSERT

TO authenticated

WITH CHECK
(
is_org_member(organization_id)
);




-- ============================================================
-- NOTIFICATIONS
-- ============================================================


CREATE POLICY "notifications_read"

ON notifications

FOR SELECT

TO authenticated

USING
(
user_id = auth.uid()
);



CREATE POLICY "notifications_create"

ON notifications

FOR INSERT

TO authenticated

WITH CHECK
(
user_id = auth.uid()
);



CREATE POLICY "notifications_update"

ON notifications

FOR UPDATE

TO authenticated

USING
(
user_id = auth.uid()
);



CREATE POLICY "notifications_delete"

ON notifications

FOR DELETE

TO authenticated

USING
(
user_id = auth.uid()
);



-- END PART 2
-- ============================================================
-- FLUXORA PRODUCTION SUPABASE SETUP
-- PART 3/3
-- Chat + Invitations + Storage + Realtime
-- ============================================================



-- ============================================================
-- INVITATIONS RLS
-- ============================================================


CREATE POLICY "invitations_read"

ON invitations

FOR SELECT

TO authenticated

USING
(
    is_org_member(organization_id)
    OR
    email = (
        SELECT email
        FROM auth.users
        WHERE id = auth.uid()
    )
);



CREATE POLICY "invitations_create"

ON invitations

FOR INSERT

TO authenticated

WITH CHECK
(
    is_org_admin(organization_id)
);



CREATE POLICY "invitations_update"

ON invitations

FOR UPDATE

TO authenticated

USING
(
    is_org_admin(organization_id)
    OR
    email = (
        SELECT email
        FROM auth.users
        WHERE id = auth.uid()
    )
);



CREATE POLICY "invitations_delete"

ON invitations

FOR DELETE

TO authenticated

USING
(
    is_org_admin(organization_id)
);





-- ============================================================
-- CHAT CHANNELS RLS
-- ============================================================


CREATE POLICY "channels_read"

ON chat_channels

FOR SELECT

TO authenticated

USING
(
    is_org_member(organization_id)
);



CREATE POLICY "channels_create"

ON chat_channels

FOR INSERT

TO authenticated

WITH CHECK
(
    is_org_member(organization_id)
);



CREATE POLICY "channels_update"

ON chat_channels

FOR UPDATE

TO authenticated

USING
(
    is_org_admin(organization_id)
);



CREATE POLICY "channels_delete"

ON chat_channels

FOR DELETE

TO authenticated

USING
(
    is_org_admin(organization_id)
);





-- ============================================================
-- CHAT MESSAGES RLS
-- ============================================================


CREATE POLICY "messages_read"

ON chat_messages

FOR SELECT

TO authenticated

USING
(
    is_org_member(organization_id)
);



CREATE POLICY "messages_create"

ON chat_messages

FOR INSERT

TO authenticated

WITH CHECK
(
    is_org_member(organization_id)
    AND
    user_id = auth.uid()
);



CREATE POLICY "messages_update"

ON chat_messages

FOR UPDATE

TO authenticated

USING
(
    user_id = auth.uid()
);



CREATE POLICY "messages_delete"

ON chat_messages

FOR DELETE

TO authenticated

USING
(
    user_id = auth.uid()
    OR
    is_org_admin(organization_id)
);






-- ============================================================
-- FILE ATTACHMENTS RLS
-- ============================================================


CREATE POLICY "files_read"

ON file_attachments

FOR SELECT

TO authenticated

USING
(
    is_org_member(organization_id)
);



CREATE POLICY "files_create"

ON file_attachments

FOR INSERT

TO authenticated

WITH CHECK
(
    is_org_member(organization_id)
    AND
    uploaded_by = auth.uid()
);



CREATE POLICY "files_delete"

ON file_attachments

FOR DELETE

TO authenticated

USING
(
    uploaded_by = auth.uid()
    OR
    is_org_admin(organization_id)
);






-- ============================================================
-- STORAGE BUCKETS
-- ============================================================


INSERT INTO storage.buckets
(
id,
name,
public
)

VALUES

(
'avatars',
'avatars',
true
)

ON CONFLICT(id)
DO NOTHING;



INSERT INTO storage.buckets
(
id,
name,
public
)

VALUES

(
'attachments',
'attachments',
false
)

ON CONFLICT(id)
DO NOTHING;






-- ============================================================
-- STORAGE POLICIES
-- ============================================================

DROP POLICY IF EXISTS "avatar_public_read"
ON storage.objects;

DROP POLICY IF EXISTS "avatar_upload"
ON storage.objects;

DROP POLICY IF EXISTS "avatar_update"
ON storage.objects;

DROP POLICY IF EXISTS "avatar_delete"
ON storage.objects;

DROP POLICY IF EXISTS "attachment_read"
ON storage.objects;

DROP POLICY IF EXISTS "attachment_upload"
ON storage.objects;

DROP POLICY IF EXISTS "attachment_delete"
ON storage.objects;



CREATE POLICY "avatar_public_read"

ON storage.objects

FOR SELECT

USING
(
bucket_id = 'avatars'
);



CREATE POLICY "avatar_upload"

ON storage.objects

FOR INSERT

TO authenticated

WITH CHECK
(
bucket_id = 'avatars'
AND
(storage.foldername(name))[1] = auth.uid()::text
);



CREATE POLICY "avatar_update"

ON storage.objects

FOR UPDATE

TO authenticated

USING
(
bucket_id = 'avatars'
AND
(storage.foldername(name))[1] = auth.uid()::text
);



CREATE POLICY "avatar_delete"

ON storage.objects

FOR DELETE

TO authenticated

USING
(
bucket_id = 'avatars'
AND
(storage.foldername(name))[1] = auth.uid()::text
);





CREATE POLICY "attachment_read"

ON storage.objects

FOR SELECT

TO authenticated

USING
(
bucket_id='attachments'
);



CREATE POLICY "attachment_upload"

ON storage.objects

FOR INSERT

TO authenticated

WITH CHECK
(
bucket_id='attachments'
);



CREATE POLICY "attachment_delete"

ON storage.objects

FOR DELETE

TO authenticated

USING
(
bucket_id='attachments'
);






-- ============================================================
-- REALTIME ENABLE
-- ============================================================


DO $$

BEGIN

ALTER PUBLICATION supabase_realtime
ADD TABLE organizations;

EXCEPTION

WHEN duplicate_object THEN NULL;

END $$;



DO $$

BEGIN

ALTER PUBLICATION supabase_realtime
ADD TABLE organization_members;

EXCEPTION

WHEN duplicate_object THEN NULL;

END $$;



DO $$

BEGIN

ALTER PUBLICATION supabase_realtime
ADD TABLE projects;

EXCEPTION

WHEN duplicate_object THEN NULL;

END $$;



DO $$

BEGIN

ALTER PUBLICATION supabase_realtime
ADD TABLE tasks;

EXCEPTION

WHEN duplicate_object THEN NULL;

END $$;



DO $$

BEGIN

ALTER PUBLICATION supabase_realtime
ADD TABLE activity_logs;

EXCEPTION

WHEN duplicate_object THEN NULL;

END $$;



DO $$

BEGIN

ALTER PUBLICATION supabase_realtime
ADD TABLE notifications;

EXCEPTION

WHEN duplicate_object THEN NULL;

END $$;



DO $$

BEGIN

ALTER PUBLICATION supabase_realtime
ADD TABLE chat_messages;

EXCEPTION

WHEN duplicate_object THEN NULL;

END $$;



DO $$

BEGIN

ALTER PUBLICATION supabase_realtime
ADD TABLE invitations;

EXCEPTION

WHEN duplicate_object THEN NULL;

END $$;





-- ============================================================
-- FINAL PERMISSIONS
-- ============================================================


GRANT USAGE ON SCHEMA public TO authenticated;


GRANT ALL ON ALL TABLES IN SCHEMA public
TO authenticated;


GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public
TO authenticated;



-- ============================================================
-- FLUXORA DATABASE SETUP COMPLETE 🚀
-- ============================================================