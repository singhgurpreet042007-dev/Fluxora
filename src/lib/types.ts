export type UserRole = 'admin' | 'member';
export type ProjectStatus = 'active' | 'archived' | 'completed';
export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type OrgPlan = 'free' | 'pro' | 'enterprise';

export interface Database {
  organizations: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    plan: OrgPlan;
    created_at: string;
    updated_at: string;
  };

  organization_members: {
    id: string;
    organization_id: string;
    user_id: string;
    role: UserRole;
    joined_at: string;
  };

  projects: {
    id: string;
    organization_id: string;
    name: string;
    description: string | null;
    status: ProjectStatus;
    color: string;
    created_by: string;
    created_at: string;
    updated_at: string;
  };

  tasks: {
    id: string;
    project_id: string;
    organization_id: string;
    title: string;
    description: string | null;
    status: TaskStatus;
    priority: TaskPriority;
    assignee_id: string | null;
    due_date: string | null;
    created_by: string;
    created_at: string;
    updated_at: string;
  };

  activity_logs: {
    id: string;
    organization_id: string;
    user_id: string;
    action: string;
    entity_type: string;
    entity_id: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
  };

  notifications: {
    id: string;
    user_id: string;
    organization_id: string | null;
    title: string;
    message: string;
    read: boolean;
    created_at: string;
  };

  user_profiles: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    timezone: string;
    updated_at: string;
  };
}

export type InvitationStatus = 'pending' | 'accepted' | 'revoked';

export interface Invitation {
  id: string;
  organization_id: string;
  organization_name: string;
  invited_by: string;
  email: string | null;
  role: UserRole;
  token: string;
  status: InvitationStatus;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
}

export interface FileAttachment {
  id: string;
  organization_id: string;
  project_id: string | null;
  task_id: string | null;
  uploaded_by: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
}

export interface ChatChannel {
  id: string;
  organization_id: string;
  project_id: string | null;
  name: string;
  created_by: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  channel_id: string;
  organization_id: string;
  user_id: string;
  content: string;
  created_at: string;
  edited_at: string | null;
}

export type Org = Database['organizations'];
export type OrgMember = Database['organization_members'];
export type Project = Database['projects'];
export type Task = Database['tasks'];
export type ActivityLog = Database['activity_logs'];
export type Notification = Database['notifications'];
export type UserProfile = Database['user_profiles'];

export interface OrgMemberWithProfile extends OrgMember {
  user_profiles: UserProfile | null;
}

export interface TaskWithAssignee extends Task {
  assignee: UserProfile | null;
}

export interface ProjectWithStats extends Project {
  task_count: number;
  completed_count: number;
}