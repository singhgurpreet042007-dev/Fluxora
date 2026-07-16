import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './lib/auth';
import { OrgProvider, useOrg } from './lib/org';
import { ToastContextProvider, useToast } from './lib/toast';
import { supabase } from './lib/supabase';
import { FullPageLoader } from './components/Loader';
import { AuthPage } from './pages/AuthPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { DashboardLayout, type Page } from './components/DashboardLayout';
import { DashboardPage } from './pages/DashboardPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { TasksPage } from './pages/TasksPage';
import { TeamPage } from './pages/TeamPage';
import { ActivityPage } from './pages/ActivityPage';
import { SettingsPage } from './pages/SettingsPage';
import type { Notification } from './lib/types';

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const { currentOrg, loading: orgLoading } = useOrg();
  const { show } = useToast();

  const [page, setPage] = useState<Page>('dashboard');
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Load notifications
  useEffect(() => {
    if (!user) return;

    supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        setNotifications((data as Notification[]) || []);
      });
  }, [user]);

  // Real-time notifications
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotif = payload.new as Notification;

          setNotifications((prev) => [newNotif, ...prev].slice(0, 20));

          show('info', newNotif.title, newNotif.message);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, show]);

  const handleMarkNotifRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, read: true } : n
      )
    );

    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id);
  };

  if (authLoading || (user && orgLoading)) {
    return <FullPageLoader />;
  }

  if (!user) {
    return <AuthPage />;
  }

  if (!currentOrg) {
    return <OnboardingPage />;
  }

  const renderPage = () => {
    switch (page) {
      case 'dashboard':
        return <DashboardPage onNavigate={setPage} />;

      case 'projects':
        return <ProjectsPage />;

      case 'tasks':
        return <TasksPage />;

      case 'team':
        return <TeamPage />;

      case 'activity':
        return <ActivityPage />;

      case 'settings':
        return <SettingsPage />;

      default:
        return <DashboardPage onNavigate={setPage} />;
    }
  };

  return (
    <DashboardLayout
      currentPage={page}
      onNavigate={setPage}
      notifications={notifications}
      onMarkNotifRead={handleMarkNotifRead}
    >
      {renderPage()}
    </DashboardLayout>
  );
}

export default function App() {
  return (
    <ToastContextProvider>
      <AuthProvider>
        <OrgProvider>
          <AppContent />
        </OrgProvider>
      </AuthProvider>
    </ToastContextProvider>
  );
}