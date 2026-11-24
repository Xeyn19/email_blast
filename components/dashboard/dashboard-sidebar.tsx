
"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DashboardIcon,
  type DashboardIconName,
} from "@/components/dashboard/dashboard-icon";
import { createClient } from "@/lib/supabase/client";

const menuItems: Array<{
  name: string;
  href?: string;
  icon: DashboardIconName;
  comingSoon?: boolean;
}> = [
  { name: "Overview", href: "/dashboard", icon: "grid" },
  { name: "Campaigns", href: "/dashboard/campaigns", icon: "campaign" },
  { name: "Contacts", href: "/dashboard/contacts", icon: "contacts" },
  { name: "Analytics", icon: "bar-chart", comingSoon: true },
  { name: "Settings", icon: "settings", comingSoon: true },
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
          if (!item.href || item.comingSoon) {
            return (
              <span
                key={item.name}
                className="nav-item nav-disabled"
                aria-disabled="true"
              >
                <DashboardIcon name={item.icon} className="nav-icon" />
                <span>{item.name}</span>
                <span className="nav-coming-soon">Coming soon</span>
              </span>
            );
          }

          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard" &&
                searchParams.get("view") !== "contacts"
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
              aria-current={active ? "page" : undefined}
            >
              <DashboardIcon name={item.icon} className="nav-icon" />
              <span>{item.name}</span>
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
            <DashboardIcon name="arrow-right" width={17} height={17} />
          </button>
        </div>
      </div>
    </aside>
  );
}
