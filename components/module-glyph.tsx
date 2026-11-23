import {
  BadgeCheck,
  BookOpen,
  Building2,
  CalendarClock,
  Database,
  Globe,
  Layers,
  LayoutDashboard,
  ListChecks,
  Server,
  Settings,
  ShieldCheck,
  Ticket,
  Users,
  type LucideIcon,
} from "lucide-react";

const GLYPHS: Record<string, LucideIcon> = {
  BookOpen,
  Layers,
  LayoutDashboard,
  ListChecks,
  Ticket,
  TicketIcon: Ticket,
  Server,
  Building2,
  ShieldCheck,
  BadgeCheck,
  CalendarClock,
  Database,
  Globe,
  Settings,
  Users,
};

export function ModuleGlyph({
  name,
  className,
  strokeWidth = 1.7,
}: {
  name: string;
  className?: string;
  strokeWidth?: number;
}) {
  const Icon = GLYPHS[name] ?? LayoutDashboard;
  return <Icon className={className} strokeWidth={strokeWidth} aria-hidden />;
}
