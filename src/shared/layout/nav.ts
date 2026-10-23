import {
  Archive,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  GraduationCap,
  House,
  type LucideIcon,
  Ticket,
  UserRoundSearch,
  Users,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Delivery slice (docs/status/phases-and-acceptance.md). */
  slice: string;
  /** One-line description taken from the specification's module scope. */
  summary: string;
}

// Order follows the reference sidebar (design-rules §2). Descriptions restate spec scope only.
export const primaryNav: readonly NavItem[] = [
  { href: "/", label: "Home", icon: House, slice: "1a", summary: "Overview of the platform's modules." },
  { href: "/societies", label: "Societies", icon: Users, slice: "2a", summary: "Society profiles, membership roles and posts." },
  { href: "/events", label: "Events", icon: Ticket, slice: "2b", summary: "Event discovery, registration and interest tracking." },
  { href: "/mates", label: "Find Mates", icon: UserRoundSearch, slice: "2c", summary: "Teammate requests, responses and connections." },
  { href: "/materials", label: "Study Material", icon: BookOpen, slice: "2d", summary: "Notes, previous-year papers and references by subject." },
  { href: "/archive", label: "Archive", icon: Archive, slice: "4c", summary: "Reviewed past student projects with discussion." },
  { href: "/faculty", label: "Faculty", icon: GraduationCap, slice: "4b", summary: "Searchable faculty directory with office hours." },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, slice: "4d", summary: "Academic, campus, society and personal calendar layers." },
  { href: "/placement", label: "Placement", icon: BriefcaseBusiness, slice: "4e", summary: "Unofficial, aggregate-only placement statistics." },
];

export const secondaryNav: readonly NavItem[] = [
  { href: "/notifications", label: "Notifications", icon: Bell, slice: "3a", summary: "Updates about registrations, requests and uploads." },
];

export const allNav: readonly NavItem[] = [...primaryNav, ...secondaryNav];

/** True when `href` is the current section. Home matches only "/" exactly. */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function findNavItem(href: string): NavItem {
  const item = allNav.find((entry) => entry.href === href);
  if (!item) throw new Error(`Unknown navigation item: ${href}`);
  return item;
}
