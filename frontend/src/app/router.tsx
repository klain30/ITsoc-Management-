/* eslint-disable react/only-export-components -- route table, not hot-reloaded */
import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

import { AppLayout } from '@/components/layout/AppLayout';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Display';
import { FullPageSpinner, RedirectIfAuthenticated, RequireAuth, RequirePermission } from '@/features/auth/guards';

// Each page is its own chunk, loaded on first visit.
const LoginPage = lazy(() => import('@/features/auth/LoginPage'));
const SetPasswordPage = lazy(() => import('@/features/auth/SetPasswordPage'));
const VerifyCertificatePage = lazy(() => import('@/features/certificates/VerifyCertificatePage'));
const QrDisplayPage = lazy(() => import('@/features/attendance/QrDisplayPage'));
const CheckInPage = lazy(() => import('@/features/attendance/CheckInPage'));
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'));
const EventsPage = lazy(() => import('@/features/events/EventsPage'));
const EventDetailPage = lazy(() => import('@/features/events/EventDetailPage'));
const AnnouncementsPage = lazy(() => import('@/features/announcements/AnnouncementsPage'));
const DocumentsPage = lazy(() => import('@/features/documents/DocumentsPage'));
const CertificatesPage = lazy(() => import('@/features/certificates/CertificatesPage'));
const MessagesPage = lazy(() => import('@/features/chat/MessagesPage'));
const NotificationsPage = lazy(() => import('@/features/notifications/NotificationsPage'));
const ProfilePage = lazy(() => import('@/features/profile/ProfilePage'));
const MembersPage = lazy(() => import('@/features/members/MembersPage'));
const MemberDetailPage = lazy(() => import('@/features/members/MemberDetailPage'));
const OfficersPage = lazy(() => import('@/features/officers/OfficersPage'));
const FinancePage = lazy(() => import('@/features/finance/FinancePage'));
const BudgetDetailPage = lazy(() => import('@/features/finance/BudgetDetailPage'));
const ExpenseDetailPage = lazy(() => import('@/features/finance/ExpenseDetailPage'));
const ReportsPage = lazy(() => import('@/features/reports/ReportsPage'));
const AuditLogPage = lazy(() => import('@/features/audit/AuditLogPage'));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'));

const standalone = (node: ReactNode) => <Suspense fallback={<FullPageSpinner />}>{node}</Suspense>;

function NotFound() {
  return (
    <EmptyState
      title="Page not found"
      description="The page you’re looking for doesn’t exist or was moved."
      action={<ButtonLink to="/dashboard" variant="secondary">Back to dashboard</ButtonLink>}
      className="py-24"
    />
  );
}

export const router = createBrowserRouter([
  // Public
  { path: '/login', element: standalone(<RedirectIfAuthenticated><LoginPage /></RedirectIfAuthenticated>) },
  { path: '/set-password', element: standalone(<SetPasswordPage />) },
  { path: '/verify/certificate/:code', element: standalone(<VerifyCertificatePage />) },

  // Signed in, full-screen (projector)
  {
    path: '/attendance/:sessionId/display',
    element: standalone(
      <RequireAuth>
        <RequirePermission anyOf={['attendance:manage']}>
          <QrDisplayPage />
        </RequirePermission>
      </RequireAuth>,
    ),
  },

  // Signed in, inside the app shell
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'check-in', element: <CheckInPage /> },
          { path: 'events', element: <EventsPage /> },
          { path: 'events/:id', element: <EventDetailPage /> },
          { path: 'announcements', element: <AnnouncementsPage /> },
          { path: 'documents', element: <DocumentsPage /> },
          { path: 'certificates', element: <CertificatesPage /> },
          { path: 'messages', element: <MessagesPage /> },
          { path: 'messages/:id', element: <MessagesPage /> },
          { path: 'notifications', element: <NotificationsPage /> },
          { path: 'profile', element: <ProfilePage /> },
          // Members can open their own record (the API allows it); others need members:read.
          { path: 'members/:id', element: <MemberDetailPage /> },
          {
            element: <RequirePermission anyOf={['members:read']} />,
            children: [
              { path: 'members', element: <MembersPage /> },
              { path: 'officers', element: <OfficersPage /> },
            ],
          },
          {
            element: <RequirePermission anyOf={['finance:read']} />,
            children: [
              { path: 'finance', element: <FinancePage /> },
              { path: 'finance/budgets/:id', element: <BudgetDetailPage /> },
              { path: 'finance/expenses/:id', element: <ExpenseDetailPage /> },
            ],
          },
          {
            element: <RequirePermission anyOf={['reports:read', 'attendance:read', 'finance:read']} />,
            children: [{ path: 'reports', element: <ReportsPage /> }],
          },
          { element: <RequirePermission anyOf={['audit:read']} />, children: [{ path: 'audit-log', element: <AuditLogPage /> }] },
          { element: <RequirePermission anyOf={['roles:assign']} />, children: [{ path: 'settings', element: <SettingsPage /> }] },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]);
