import {
  BadgeCheck,
  Building2,
  CalendarClock,
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
