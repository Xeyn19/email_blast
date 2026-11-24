import type { SVGProps } from "react";

export type DashboardIconName =
  | "alert"
  | "arrow-right"
  | "bar-chart"
  | "campaign"
  | "check"
  | "clock"
  | "contacts"
  | "draft"
  | "grid"
  | "layers"
  | "plus"
  | "send"
  | "settings"
  | "upload";

export function DashboardIcon({
  name,
  ...props
}: { name: DashboardIconName } & SVGProps<SVGSVGElement>) {
  const commonProps = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };

  if (name === "grid") {
    return <svg {...commonProps}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
  }
  if (name === "campaign") {
    return <svg {...commonProps}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>;
  }
  if (name === "contacts") {
    return <svg {...commonProps}><circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 4.8a3 3 0 0 1 0 5.8M17 14.5a5 5 0 0 1 3.5 5.5"/></svg>;
  }
  if (name === "bar-chart") {
    return <svg {...commonProps}><path d="M4 20V10M10 20V4M16 20v-7M22 20V7"/></svg>;
  }
  if (name === "settings") {
    return <svg {...commonProps}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1v.1h-4v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1-.4h-.1v-4H3a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1v-.1h4V3a1.7 1.7 0 0 0 1.1 1.6 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.17.38.38.72.6 1 .28.25.63.39 1 .4h.1v4H21a1.7 1.7 0 0 0-1.6.6Z"/></svg>;
  }
  if (name === "plus") {
    return <svg {...commonProps}><path d="M12 5v14M5 12h14"/></svg>;
  }
  if (name === "upload") {
    return <svg {...commonProps}><path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 14v5h14v-5"/></svg>;
  }
  if (name === "layers") {
    return <svg {...commonProps}><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></svg>;
  }
  if (name === "clock") {
    return <svg {...commonProps}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
  }
  if (name === "check") {
    return <svg {...commonProps}><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>;
  }
  if (name === "alert") {
    return <svg {...commonProps}><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/></svg>;
  }
  if (name === "send") {
    return <svg {...commonProps}><path d="m21 3-7 18-4-7-7-4 18-7Z"/><path d="m10 14 4-4"/></svg>;
  }
  if (name === "draft") {
    return <svg {...commonProps}><path d="M6 3h8l4 4v14H6V3Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>;
  }
  return <svg {...commonProps}><path d="M5 12h14M14 7l5 5-5 5"/></svg>;
}
