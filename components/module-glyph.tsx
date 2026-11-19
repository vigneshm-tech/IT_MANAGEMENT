import {
  BadgeCheck,
  Building2,
  CalendarClock,
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
  LayoutDashboard,
  ListChecks,
  Ticket,
  TicketIcon: Ticket,
  Server,
  Building2,
  ShieldCheck,
  BadgeCheck,
  CalendarClock,
  Settings,
  Users,
};

export function ModuleGlyph({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const Icon = GLYPHS[name] ?? LayoutDashboard;
  return <Icon className={className} strokeWidth={1.7} aria-hidden />;
}
