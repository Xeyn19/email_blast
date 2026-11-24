import Link from "next/link";
import {
  getCampaignDisplayStatus,
  getCampaignPrimaryAction,
  type CampaignDeliveryMembership,
  type CampaignDisplayStatus,
} from "@/lib/campaigns/dashboard";
import {
  getDeliveryStepState,
  type AudienceHealth,
  type DeliveryOverview,
  type OverviewMetrics,
} from "@/lib/dashboard/overview";
import { DashboardIcon, type DashboardIconName } from "./dashboard-icon";

export type RecentOverviewCampaign = {
  id: string;
  name: string;
  status: string;
  cronArmedAt: string | null;
  recipientCount: number;
  updatedAt: string;
};

type DashboardOverviewProps = {
  userName: string;
  metrics: OverviewMetrics;
  audience: AudienceHealth;
  delivery: DeliveryOverview;
  recentCampaigns: RecentOverviewCampaign[];
  memberships: Record<string, CampaignDeliveryMembership>;
  dataWarning?: boolean;
};

const deliverySteps = [
  { id: "prepared", label: "Prepared", description: "Drafts ready to send" },
  { id: "waiting", label: "Waiting for cron", description: "Queued for schedule" },
  { id: "sending", label: "Sending", description: "Currently delivering" },
  { id: "completed", label: "Completed", description: "Provider confirmed" },
] as const;

export function DashboardOverview({
  userName,
  metrics,
  audience,
  delivery,
  recentCampaigns,
  memberships,
  dataWarning = false,
}: DashboardOverviewProps) {
  return (
    <div className="mx-auto w-full max-w-[1500px] pb-8">
      <header className="flex flex-wrap items-start justify-between gap-5 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Overview</h1>
          <p className="mt-2 text-sm text-gray-400 md:text-base">
            Monitor campaign delivery and audience readiness.
          </p>
          <p className="mt-4 text-lg font-semibold text-gray-100">
            Welcome back, {userName}.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <Link
            href="/dashboard?view=contacts#import-contacts"
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold text-gray-200 transition hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 sm:flex-none"
          >
            <DashboardIcon name="upload" className="h-4 w-4" />
            Import contacts
          </Link>
          <Link
            href="/dashboard/campaigns/new"
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-orange-500 px-5 text-sm font-semibold text-white transition hover:bg-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 sm:flex-none"
          >
            <DashboardIcon name="plus" className="h-4 w-4" />
            Create campaign
          </Link>
        </div>
      </header>

      {dataWarning ? (
        <div
          role="alert"
          className="mb-5 flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-500/[0.08] p-4 text-sm text-amber-100"
        >
          <DashboardIcon name="alert" className="mt-0.5 h-5 w-5 shrink-0" />
          <span>
            Some dashboard information could not be refreshed. Available data is still shown; refresh to try again.
          </span>
        </div>
      ) : null}

      <DeliveryStatusPanel delivery={delivery} />

      <section
        aria-label="Campaign summary"
        className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          label="Active work"
          description="Campaigns not yet completed"
          value={metrics.active}
          href="/dashboard/campaigns"
          icon="draft"
        />
        <MetricCard
          label="Waiting for cron"
          description="Campaigns queued for cron"
          value={metrics.waiting}
          href="/dashboard/campaigns?view=waiting"
          icon="clock"
          tone="orange"
        />
        <MetricCard
          label="Sent campaigns"
          description="Campaigns confirmed sent"
          value={metrics.sent}
          href="/dashboard/campaigns?view=sent"
          icon="check"
          tone="green"
        />
        <MetricCard
          label="Needs attention"
          description="Campaigns with issues"
          value={metrics.failed}
          href="/dashboard/campaigns?view=failed"
          icon="alert"
          tone="red"
        />
      </section>

      <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <RecentCampaigns campaigns={recentCampaigns} memberships={memberships} />
        <aside className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <QuickActions />
          <AudienceHealthCard audience={audience} />
        </aside>
      </div>
    </div>
  );
}

function DeliveryStatusPanel({ delivery }: { delivery: DeliveryOverview }) {
  const batch = delivery.kind === "empty" || delivery.kind === "unavailable"
    ? null
    : delivery.batch;
  const content = getDeliveryContent(delivery);

  return (
    <section className="rounded-2xl border border-white/15 bg-[#151515] p-5 md:p-6">
      <div className="flex items-center gap-3 text-white">
        <DashboardIcon name="send" className="h-5 w-5 text-orange-400" />
        <h2 className="text-lg font-semibold">Delivery status</h2>
      </div>
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(260px,0.75fr)_minmax(520px,1.5fr)] lg:items-center">
        <div className="border-white/10 lg:border-r lg:pr-8">
          <h3 className="text-xl font-semibold text-white">{content.title}</h3>
          <p className="mt-1.5 max-w-md text-sm leading-6 text-gray-400">
            {content.description}
          </p>
          <Link
            href={content.href}
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
          >
            {content.action}
            <DashboardIcon name="arrow-right" className="h-4 w-4" />
          </Link>
          {batch ? (
            <p className="mt-3 text-xs text-gray-500">
              {batch.campaignCount} {batch.campaignCount === 1 ? "campaign" : "campaigns"} in this batch
            </p>
          ) : null}
        </div>

        <ol className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-4" aria-label="Delivery lifecycle">
          {deliverySteps.map((step) => {
            const state = getDeliveryStepState(step.id, delivery);
            return (
              <li key={step.id} className="relative text-center">
                <span
                  className={`mx-auto grid h-7 w-7 place-items-center rounded-full border-2 text-xs font-bold ${
                    state === "complete"
                      ? "border-orange-500 bg-orange-500 text-white"
                      : state === "current"
                        ? "border-orange-500 bg-[#151515] text-orange-300 shadow-[0_0_0_4px_rgba(255,101,0,0.14)]"
                        : "border-white/25 bg-[#151515] text-gray-500"
                  }`}
                >
                  {state === "complete" ? "✓" : ""}
                </span>
                <strong className="mt-2 block text-sm text-gray-100">{step.label}</strong>
                <span className="mt-1 block text-xs leading-4 text-gray-500">{step.description}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function getDeliveryContent(delivery: DeliveryOverview) {
  if (delivery.kind === "unavailable") {
    return {
      title: "Delivery status unavailable",
      description: "The latest delivery information could not be loaded. Open campaigns to review your current work.",
      action: "View campaigns",
      href: "/dashboard/campaigns",
    };
  }
  if (delivery.kind === "empty") {
    return {
      title: "No active delivery batch",
      description: "Nothing is waiting for cron or being sent.",
      action: "Prepare drafts",
      href: "/dashboard/campaigns?view=drafts",
    };
  }
  if (delivery.kind === "prepared") {
    return {
      title: delivery.batch.name,
      description: "This delivery batch is prepared in Brevo and ready to add to cron.",
      action: "Continue batch",
      href: `/dashboard/campaign-batches/${delivery.batch.id}`,
    };
  }
  if (delivery.kind === "waiting") {
    return {
      title: delivery.batch.name,
      description: "This batch is waiting for the next external cron run.",
      action: "View delivery batch",
      href: `/dashboard/campaign-batches/${delivery.batch.id}`,
    };
  }
  return {
    title: delivery.batch.name,
    description: `${delivery.batch.sentCount} of ${delivery.batch.campaignCount} campaigns are confirmed sent.`,
    action: "View progress",
    href: `/dashboard/campaign-batches/${delivery.batch.id}`,
  };
}

function MetricCard({
  label,
  description,
  value,
  href,
  icon,
  tone = "default",
}: {
  label: string;
  description: string;
  value: number;
  href: string;
  icon: DashboardIconName;
  tone?: "default" | "orange" | "green" | "red";
}) {
  const tones = {
    default: "text-gray-300 group-hover:border-white/30",
    orange: "text-orange-300 group-hover:border-orange-400/45",
    green: "text-emerald-300 group-hover:border-emerald-400/40",
    red: "text-red-300 group-hover:border-red-400/40",
  };
  return (
    <Link
      href={href}
      className={`group flex min-h-28 items-start gap-4 rounded-xl border border-white/15 bg-[#151515] p-4 transition hover:-translate-y-0.5 hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 ${tones[tone]}`}
    >
      <DashboardIcon name={icon} className="mt-0.5 h-6 w-6 shrink-0" />
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-200">
          {label}
          <DashboardIcon name="arrow-right" className="h-3.5 w-3.5 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
        </span>
        <strong className="mt-1 block text-3xl leading-none text-white">{value}</strong>
        <span className="mt-2 block text-xs text-gray-500">{description}</span>
      </span>
    </Link>
  );
}

function RecentCampaigns({
  campaigns,
  memberships,
}: {
  campaigns: RecentOverviewCampaign[];
  memberships: Record<string, CampaignDeliveryMembership>;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/15 bg-[#151515]">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div>
          <h2 className="text-lg font-semibold text-white">Recent campaigns</h2>
          <p className="mt-1 text-sm text-gray-500">Your latest activity, from drafts to sent deliveries.</p>
        </div>
        <Link href="/dashboard/campaigns?view=all" className="inline-flex items-center gap-2 text-sm font-semibold text-orange-300 hover:text-orange-200">
          View all campaigns
          <DashboardIcon name="arrow-right" className="h-4 w-4" />
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="border-t border-white/10 p-8 text-center">
          <p className="text-sm text-gray-400">No campaigns yet.</p>
          <Link href="/dashboard/campaigns/new" className="mt-3 inline-flex text-sm font-semibold text-orange-300 hover:text-orange-200">Create your first campaign</Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left">
            <thead className="border-y border-white/10 bg-white/[0.035] text-xs uppercase tracking-[0.08em] text-gray-500">
              <tr><th className="px-5 py-3 font-semibold">Campaign</th><th className="px-4 py-3 font-semibold">Audience</th><th className="px-4 py-3 font-semibold">Delivery</th><th className="px-4 py-3 font-semibold">Updated</th><th className="px-5 py-3 text-right font-semibold">Action</th></tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => {
                const membership = memberships[campaign.id];
                const status = getCampaignDisplayStatus(
                  { status: campaign.status, cronArmedAt: campaign.cronArmedAt },
                  membership,
                );
                const action = getCampaignPrimaryAction(campaign.id, status, membership, { compact: true });
                return (
                  <tr key={campaign.id} className="border-b border-white/10 transition last:border-b-0 hover:bg-white/[0.025]">
                    <td className="max-w-md px-5 py-4"><Link href={`/dashboard/campaigns/${campaign.id}`} className="flex items-center gap-3 font-medium text-gray-100 hover:text-white"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-orange-500/10 text-orange-400"><DashboardIcon name="campaign" className="h-4 w-4" /></span><span className="line-clamp-2 break-words">{campaign.name}</span></Link></td>
                    <td className="px-4 py-4 text-sm text-gray-400">{campaign.recipientCount} {campaign.recipientCount === 1 ? "recipient" : "recipients"}</td>
                    <td className="px-4 py-4"><CampaignStatusBadge status={status} /></td>
                    <td className="px-4 py-4 text-sm text-gray-400">{formatManilaDateTime(campaign.updatedAt)}</td>
                    <td className="px-5 py-4 text-right"><Link href={action.href} className="inline-flex min-h-9 items-center rounded-lg border border-white/25 px-3 py-1.5 text-sm font-semibold text-gray-100 transition hover:border-orange-400/60 hover:text-orange-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400">{action.label}</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CampaignStatusBadge({ status }: { status: CampaignDisplayStatus }) {
  const config: Record<CampaignDisplayStatus, { label: string; className: string }> = {
    archived: { label: "Archived", className: "border-gray-400/25 bg-gray-500/10 text-gray-300" },
    draft: { label: "Draft", className: "border-white/20 bg-white/[0.05] text-gray-300" },
    prepared: { label: "Prepared", className: "border-amber-400/30 bg-amber-500/10 text-amber-200" },
    waiting: { label: "Waiting for cron", className: "border-orange-400/35 bg-orange-500/10 text-orange-200" },
    sending: { label: "Sending", className: "border-sky-400/35 bg-sky-500/10 text-sky-200" },
    sent: { label: "Sent", className: "border-emerald-400/35 bg-emerald-500/10 text-emerald-200" },
    failed: { label: "Needs attention", className: "border-red-400/35 bg-red-500/10 text-red-200" },
  };
  const value = config[status];
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${value.className}`}>{value.label}</span>;
}

function QuickActions() {
  const actions = [
    { label: "Create campaign", href: "/dashboard/campaigns/new", icon: "plus", primary: true },
    { label: "Import contacts", href: "/dashboard?view=contacts#import-contacts", icon: "upload" },
    { label: "Prepare drafts together", href: "/dashboard/campaigns?view=drafts", icon: "layers" },
  ] as const;
  return (
    <section className="rounded-2xl border border-white/15 bg-[#151515] p-5">
      <h2 className="text-lg font-semibold text-white">Quick actions</h2>
      <p className="mt-1 text-sm text-gray-500">Common tasks to keep campaigns moving.</p>
      <div className="mt-4 grid gap-2">
        {actions.map((action) => (
          <Link key={action.label} href={action.href} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 ${"primary" in action && action.primary ? "border-orange-500 bg-orange-500 text-white hover:bg-orange-600" : "border-white/20 text-gray-200 hover:border-white/35 hover:bg-white/[0.04]"}`}>
            <DashboardIcon name={action.icon} className="h-4 w-4" />
            {action.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

function AudienceHealthCard({ audience }: { audience: AudienceHealth }) {
  return (
    <section className="rounded-2xl border border-white/15 bg-[#151515] p-5">
      <h2 className="text-lg font-semibold text-white">Audience health</h2>
      <p className="mt-1 text-sm text-gray-500">Current state of your contact audience.</p>
      <dl className="mt-5 grid grid-cols-3 divide-x divide-white/10">
        <div className="pr-3"><dt className="text-xs text-gray-400">Subscribed</dt><dd className="mt-1 text-2xl font-bold text-white">{audience.subscribed}</dd></div>
        <div className="px-3"><dt className="text-xs text-gray-400">Pending</dt><dd className="mt-1 text-2xl font-bold text-white">{audience.pending}</dd></div>
        <div className="pl-3"><dt className="text-xs text-gray-400">Unsubscribed</dt><dd className="mt-1 text-2xl font-bold text-red-400">{audience.unsubscribed}</dd></div>
      </dl>
      <Link href="/dashboard?view=contacts" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-orange-300 hover:text-orange-200">
        Manage {audience.total} contacts
        <DashboardIcon name="arrow-right" className="h-4 w-4" />
      </Link>
    </section>
  );
}

function formatManilaDateTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

export function DashboardOverviewSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1500px] animate-pulse pb-8" aria-label="Loading overview">
      <div className="h-24 rounded-xl bg-white/[0.035]" />
      <div className="mt-5 h-52 rounded-2xl border border-white/10 bg-white/[0.025]" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 rounded-xl border border-white/10 bg-white/[0.025]" />)}</div>
      <div className="mt-5 h-80 rounded-2xl border border-white/10 bg-white/[0.025]" />
    </div>
  );
}
