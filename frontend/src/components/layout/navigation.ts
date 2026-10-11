import {
  Award,
  CalendarDays,
  ChartColumn,
  FileText,
  LayoutDashboard,
  MessageCircle,
  Megaphone,
  ScrollText,
  Settings,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import type { Permission } from '@/types/api';

export type NavItem = { label: string; to: string; icon: LucideIcon; anyOf?: Permission[]; badge?: 'messages' };
export type NavSection = { title?: string; items: NavItem[] };

/** Items without `anyOf` are visible to every signed-in user. */
export const NAVIGATION: NavSection[] = [
  {
    items: [
      { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
      { label: 'Messages', to: '/messages', icon: MessageCircle, badge: 'messages' },
      { label: 'Events', to: '/events', icon: CalendarDays },
      { label: 'Announcements', to: '/announcements', icon: Megaphone },
      { label: 'Documents', to: '/documents', icon: FileText },
      { label: 'My certificates', to: '/certificates', icon: Award },
    ],
  },
  {
    title: 'Management',
    items: [
      { label: 'Members', to: '/members', icon: Users, anyOf: ['members:read'] },
      { label: 'Officers', to: '/officers', icon: UserCog, anyOf: ['members:read'] },
      { label: 'Finance', to: '/finance', icon: Wallet, anyOf: ['finance:read'] },
      { label: 'Reports', to: '/reports', icon: ChartColumn, anyOf: ['reports:read', 'attendance:read', 'finance:read'] },
      { label: 'Audit log', to: '/audit-log', icon: ScrollText, anyOf: ['audit:read'] },
      { label: 'Settings', to: '/settings', icon: Settings, anyOf: ['roles:assign'] },
    ],
  },
];
