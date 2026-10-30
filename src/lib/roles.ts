/** Staff roles and what each can open. Enforced in middleware (pages) and in the database (RLS). */
export type Role = "owner" | "manager" | "cook" | "driver";

export const ROLES: { role: Role; label: string; can: string }[] = [
  { role: "owner", label: "Owner", can: "Everything, including sales, settings and staff" },
  { role: "manager", label: "Manager", can: "Orders, menu, customers, reviews, promos, expenses, deliveries" },
  { role: "cook", label: "Cook", can: "Orders screen only" },
  { role: "driver", label: "Driver", can: "Their deliveries only" },
];

export const NAV: { href: string; label: string; roles: Role[] }[] = [
  { href: "/admin", label: "Orders", roles: ["owner", "manager", "cook"] },
  { href: "/admin/driver", label: "Deliveries", roles: ["owner", "manager", "driver"] },
  { href: "/admin/menu", label: "Menu", roles: ["owner", "manager"] },
  { href: "/admin/customers", label: "Customers", roles: ["owner", "manager"] },
  { href: "/admin/reviews", label: "Reviews", roles: ["owner", "manager"] },
  { href: "/admin/promos", label: "Promos", roles: ["owner", "manager"] },
  { href: "/admin/sales", label: "Sales", roles: ["owner"] },
  { href: "/admin/expenses", label: "Expenses", roles: ["owner", "manager"] },
  { href: "/admin/staff", label: "Staff", roles: ["owner"] },
  { href: "/admin/settings", label: "Settings", roles: ["owner"] },
];

export const homeFor = (r: Role) => (r === "driver" ? "/admin/driver" : "/admin");

/** Pages reached from a button rather than the menu bar. */
const EXTRA: { href: string; roles: Role[] }[] = [{ href: "/admin/new-order", roles: ["owner", "manager", "cook"] }];

export function canOpen(role: Role, path: string) {
  if (role === "owner") return true;
  const p = path.replace(/\/+$/, "") || "/admin";
  if (EXTRA.some((e) => e.roles.includes(role) && (p === e.href || p.startsWith(e.href + "/")))) return true;
  return NAV.some((n) => n.roles.includes(role) && (p === n.href || (n.href !== "/admin" && p.startsWith(n.href + "/"))));
}

export const isRole = (r: unknown): r is Role => r === "owner" || r === "manager" || r === "cook" || r === "driver";
