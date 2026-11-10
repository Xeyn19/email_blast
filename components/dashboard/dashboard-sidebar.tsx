
"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const menuItems = [
  { name: "Overview", href: "/dashboard", icon: "▦" },
  { name: "Campaigns", href: "/dashboard/campaigns", icon: "✉" },
  { name: "Contacts", href: "/dashboard/contacts", icon: "♙" },
  { name: "Analytics", href: "/dashboard/analytics", icon: "▥" },
  { name: "Settings", href: "/dashboard/settings", icon: "⚙" },
];

type Props = {
  user: {
    name: string;
    email: string;
  };
};

export default function DashboardSidebar({ user }: Props) {
const pathname = usePathname();
const searchParams = useSearchParams();
const router = useRouter();

  const initials =
    user.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U";

  async function handleLogout() {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      alert("Unable to log out. Please try again.");
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <aside className="dashboard-sidebar">
      <Link href="/dashboard" className="dashboard-brand">
        <span className="dashboard-logo">E</span>
        <span>
          Email<span className="brand-highlight">Blast</span>
        </span>
      </Link>

      <p className="sidebar-label">WORKSPACE</p>

      <nav className="dashboard-nav">
        {menuItems.map((item) => {
const active =
  item.href === "/dashboard"
    ? pathname === "/dashboard" && searchParams.get("view") !== "contacts"
    : item.href === "/dashboard/contacts"
      ? pathname.startsWith(item.href) ||
        (pathname === "/dashboard" &&
          searchParams.get("view") === "contacts")
      : pathname.startsWith(item.href);

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`nav-item ${active ? "nav-active" : ""}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-bottom">
        <div className="sidebar-help">
          <div className="help-icon">✦</div>
          <strong>Need help?</strong>
          <p>Manage your campaigns with ease.</p>
        </div>

        <div className="sidebar-user">
          <div className="avatar">{initials}</div>

          <div className="user-info">
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>

          <button
            type="button"
            className="user-menu"
            onClick={handleLogout}
            title="Log out"
            aria-label="Log out"
          >
            ↪
          </button>
        </div>
      </div>
    </aside>
  );
}
