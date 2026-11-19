import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import {
  CampaignBatchSelectionTable,
  type CampaignDashboardRow,
} from "@/components/campaigns/CampaignBatchSelectionTable";
import type { CampaignDeliveryMembership } from "@/lib/campaigns/dashboard";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 20;
const CAMPAIGN_VIEWS = [
  "active",
  "drafts",
  "prepared",
  "waiting",
  "sending",
  "sent",
  "failed",
  "all",
] as const;
type CampaignView = (typeof CAMPAIGN_VIEWS)[number];
type SearchParams = Promise<{
  view?: string | string[];
  q?: string | string[];
  page?: string | string[];
}>;

export default function CampaignsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#0b0b0b] p-6 text-white md:p-10">
          <p className="text-gray-400">Loading campaign dashboard…</p>
        </main>
      }
    >
      <CampaignsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function CampaignsContent({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const query = await searchParams;
  const view = parseView(singleValue(query.view));
  const search = singleValue(query.q).trim().slice(0, 120);
  const page = parsePage(singleValue(query.page));
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const activeMembershipResult = await supabase
    .from("campaign_batch_items")
    .select(
      "campaign_id, preparation_status, campaign_batches!inner(id, name, status, armed_at, user_id)",
    )
    .eq("campaign_batches.user_id", user.id)
    .in("campaign_batches.status", [
      "draft",
      "preparing",
      "prepared",
      "waiting",
      "sending",
    ]);

  const activeMemberships = activeMembershipResult.data ?? [];
  const preparedCampaignIds = activeMemberships.flatMap((item) => {
    const batch = firstRelation(item.campaign_batches) as {
      status?: string;
    } | null;
    return item.preparation_status === "prepared" &&
      batch &&
      ["draft", "preparing", "prepared"].includes(batch.status ?? "")
      ? [item.campaign_id as string]
      : [];
  });

  let campaignsQuery = supabase
    .from("campaigns")
    .select(
      "id, name, subject, status, created_at, cron_armed_at, source_campaign_id",
      { count: "exact" },
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (search) {
    const pattern = quotePostgrestValue(`%${search}%`);
    campaignsQuery = campaignsQuery.or(
      `name.ilike.${pattern},subject.ilike.${pattern}`,
    );
  }

  if (view === "active") {
    campaignsQuery = campaignsQuery.in("status", ["draft", "sending", "failed"]);
  } else if (view === "drafts") {
    campaignsQuery = campaignsQuery
      .eq("status", "draft")
      .is("cron_armed_at", null);
    if (preparedCampaignIds.length > 0) {
      campaignsQuery = campaignsQuery.not(
        "id",
        "in",
        `(${preparedCampaignIds.join(",")})`,
      );
    }
  } else if (view === "prepared") {
    campaignsQuery = campaignsQuery
      .eq("status", "draft")
      .is("cron_armed_at", null)
      .in(
        "id",
        preparedCampaignIds.length > 0
          ? preparedCampaignIds
          : ["00000000-0000-0000-0000-000000000000"],
      );
  } else if (view === "waiting") {
    campaignsQuery = campaignsQuery
      .eq("status", "draft")
      .not("cron_armed_at", "is", null);
  } else if (view === "sending") {
    campaignsQuery = campaignsQuery.eq("status", "sending");
  } else if (view === "sent") {
    campaignsQuery = campaignsQuery.eq("status", "sent");
  } else if (view === "failed") {
    campaignsQuery = campaignsQuery.eq("status", "failed");
  }

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const [
    campaignsResult,
    resendDraftsResult,
    activeCountResult,
    waitingCountResult,
    sendingCountResult,
    failedCountResult,
    activeBatchResult,
  ] = await Promise.all([
    campaignsQuery.range(from, to),
    supabase
      .from("campaigns")
      .select("id, source_campaign_id, cron_armed_at")
      .eq("user_id", user.id)
      .eq("status", "draft")
      .not("source_campaign_id", "is", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("campaigns")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .in("status", ["draft", "sending", "failed"]),
    supabase
      .from("campaigns")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "draft")
      .not("cron_armed_at", "is", null),
    supabase
      .from("campaigns")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "sending"),
    supabase
      .from("campaigns")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "failed"),
    supabase
      .from("campaign_batches")
      .select(
        "id, name, status, armed_at, claimed_at, campaign_batch_items(campaign_id, campaigns(status))",
      )
      .eq("user_id", user.id)
      .in("status", ["waiting", "sending"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const campaigns = (campaignsResult.data ?? []) as CampaignDashboardRow[];
  const campaignIds = campaigns.map((campaign) => campaign.id);
  const membershipsResult =
    campaignIds.length > 0
      ? await supabase
          .from("campaign_batch_items")
          .select(
            "campaign_id, preparation_status, campaign_batches!inner(id, name, status, armed_at, user_id)",
          )
          .in("campaign_id", campaignIds)
          .eq("campaign_batches.user_id", user.id)
      : { data: [], error: null };

  const batchMemberships: Record<string, CampaignDeliveryMembership> = {};
  for (const item of membershipsResult.data ?? []) {
    const batch = firstRelation(item.campaign_batches) as {
      id: string;
      name: string;
      status: string;
    } | null;
    if (!batch) continue;
    batchMemberships[item.campaign_id as string] = {
      batchId: batch.id,
      batchName: batch.name,
      batchStatus: batch.status,
      preparationStatus: item.preparation_status as string,
    };
  }

  const activeResendDrafts: Record<string, { id: string; armed: boolean }> = {};
  for (const campaign of resendDraftsResult.data ?? []) {
    const sourceId = campaign.source_campaign_id as string | null;
    if (sourceId && !activeResendDrafts[sourceId]) {
      activeResendDrafts[sourceId] = {
        id: campaign.id as string,
        armed: Boolean(campaign.cron_armed_at),
      };
    }
  }

  const dataError =
    activeMembershipResult.error ||
    campaignsResult.error ||
    resendDraftsResult.error ||
    membershipsResult.error ||
    activeBatchResult.error;
  const total = campaignsResult.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="min-h-screen bg-[#0b0b0b] p-5 text-white md:p-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Campaigns</h1>
            <p className="mt-2 max-w-2xl text-gray-400">
              Review active work first, then use status views to find every
              campaign in its delivery lifecycle.
            </p>
          </div>
          <Link
            href="/dashboard/campaigns/new"
            className="inline-flex min-h-11 items-center rounded-lg bg-orange-500 px-5 py-3 font-semibold text-white transition hover:bg-orange-600"
          >
            + Create campaign
          </Link>
        </div>

        <ActiveDeliveryCard batch={activeBatchResult.data} />

        <section
          aria-label="Campaign overview"
          className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <OverviewCard
            label="Active work"
            value={activeCountResult.count ?? 0}
            href={campaignsHref("active", search)}
            active={view === "active"}
          />
          <OverviewCard
            label="Waiting for cron"
            value={waitingCountResult.count ?? 0}
            href={campaignsHref("waiting", search)}
            active={view === "waiting"}
            tone="orange"
          />
          <OverviewCard
            label="Sending"
            value={sendingCountResult.count ?? 0}
            href={campaignsHref("sending", search)}
            active={view === "sending"}
            tone="blue"
          />
          <OverviewCard
            label="Needs attention"
            value={failedCountResult.count ?? 0}
            href={campaignsHref("failed", search)}
            active={view === "failed"}
            tone="red"
          />
        </section>

        <nav
          aria-label="Campaign status views"
          className="mt-6 overflow-x-auto border-b border-white/10"
        >
          <div className="flex min-w-max gap-1">
            {CAMPAIGN_VIEWS.map((tab) => (
              <Link
                key={tab}
                href={campaignsHref(tab, search)}
                aria-current={view === tab ? "page" : undefined}
                className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${
                  view === tab
                    ? "border-orange-500 text-orange-200"
                    : "border-transparent text-gray-400 hover:text-white"
                }`}
              >
                {viewLabel(tab)}
              </Link>
            ))}
          </div>
        </nav>

        <div className="my-5 flex flex-wrap items-center justify-between gap-3">
          <form
            action="/dashboard/campaigns"
            method="get"
            className="flex w-full max-w-xl gap-2"
          >
            <input type="hidden" name="view" value={view} />
            <label htmlFor="campaign-search" className="sr-only">
              Search campaigns
            </label>
            <input
              id="campaign-search"
              name="q"
              type="search"
              defaultValue={search}
              placeholder="Search campaign name or subject"
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-white/20 bg-[#151515] px-4 text-sm text-white outline-none transition placeholder:text-gray-500 focus:border-orange-400"
            />
            <button type="submit" className="campaign-secondary-button">
              Search
            </button>
            {search ? (
              <Link
                href={campaignsHref(view)}
                className="campaign-secondary-button inline-flex items-center"
              >
                Clear
              </Link>
            ) : null}
          </form>
          <span className="text-sm text-gray-400">
            {total} {total === 1 ? "campaign" : "campaigns"}
          </span>
        </div>

        {dataError ? (
          <p className="mb-4 rounded-lg border border-red-400/30 bg-red-950/30 p-4 text-red-200">
            Unable to load all campaign information. Refresh and try again.
          </p>
        ) : null}

        {!dataError ? (
          <CampaignBatchSelectionTable
            campaigns={campaigns}
            activeResendDrafts={activeResendDrafts}
            batchMemberships={batchMemberships}
          />
        ) : null}

        {!dataError && pageCount > 1 ? (
          <Pagination
            page={page}
            pageCount={pageCount}
            view={view}
            search={search}
          />
        ) : null}

        <div className="mt-8">
          <Link
            href="/dashboard"
            className="text-sm text-orange-400 hover:text-orange-300"
          >
            ← Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}

function ActiveDeliveryCard({ batch }: { batch: unknown }) {
  const value = batch as {
    id?: string;
    name?: string;
    status?: string;
    armed_at?: string | null;
    campaign_batch_items?: Array<{
      campaign_id?: string;
      campaigns?: { status?: string } | Array<{ status?: string }>;
    }>;
  } | null;

  if (!value?.id) {
    return (
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full border border-white/15 text-gray-400">
            ✓
          </span>
          <div>
            <h2 className="font-semibold text-white">No active delivery batch</h2>
            <p className="mt-1 text-sm text-gray-400">
              Nothing is currently waiting for cron or being sent.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const items = value.campaign_batch_items ?? [];
  const sent = items.filter((item) => {
    const campaign = firstRelation(item.campaigns) as { status?: string } | null;
    return campaign?.status === "sent";
  }).length;
  const waiting = value.status === "waiting";

  return (
    <section className="rounded-2xl border border-orange-400/30 bg-orange-500/[0.07] p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-orange-300">
            Active delivery
          </span>
          <h2 className="mt-2 text-xl font-semibold text-white">{value.name}</h2>
          <p className="mt-1 text-sm text-gray-300">
            {waiting
              ? `${items.length} campaigns waiting for the next external cron run.`
              : `${sent} of ${items.length} campaigns confirmed sent.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-orange-400/40 bg-black/20 px-3 py-1.5 text-xs font-semibold text-orange-200">
            {waiting ? "Waiting for cron" : "Sending"}
          </span>
          <Link
            href={`/dashboard/campaign-batches/${value.id}`}
            className="inline-flex min-h-11 items-center rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            View delivery batch
          </Link>
        </div>
      </div>
    </section>
  );
}

function OverviewCard({
  label,
  value,
  href,
  active,
  tone = "default",
}: {
  label: string;
  value: number;
  href: string;
  active: boolean;
  tone?: "default" | "orange" | "blue" | "red";
}) {
  const tones = {
    default: "hover:border-white/30",
    orange: "hover:border-orange-400/50",
    blue: "hover:border-sky-400/50",
    red: "hover:border-red-400/50",
  };
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-xl border bg-white/[0.03] p-4 transition ${
        active ? "border-orange-400/60" : `border-white/10 ${tones[tone]}`
      }`}
    >
      <span className="text-xs text-gray-400">{label}</span>
      <strong className="mt-1 block text-2xl text-white">{value}</strong>
    </Link>
  );
}

function Pagination({
  page,
  pageCount,
  view,
  search,
}: {
  page: number;
  pageCount: number;
  view: CampaignView;
  search: string;
}) {
  return (
    <nav
      aria-label="Campaign pagination"
      className="mt-5 flex items-center justify-between gap-4"
    >
      <Link
        href={campaignsHref(view, search, Math.max(1, page - 1))}
        aria-disabled={page <= 1}
        className={`campaign-secondary-button inline-flex items-center ${
          page <= 1 ? "pointer-events-none opacity-40" : ""
        }`}
      >
        Previous
      </Link>
      <span className="text-sm text-gray-400">
        Page {page} of {pageCount}
      </span>
      <Link
        href={campaignsHref(view, search, Math.min(pageCount, page + 1))}
        aria-disabled={page >= pageCount}
        className={`campaign-secondary-button inline-flex items-center ${
          page >= pageCount ? "pointer-events-none opacity-40" : ""
        }`}
      >
        Next
      </Link>
    </nav>
  );
}

function campaignsHref(view: CampaignView, search = "", page = 1) {
  const params = new URLSearchParams();
  if (view !== "active") params.set("view", view);
  if (search) params.set("q", search);
  if (page > 1) params.set("page", String(page));
  const value = params.toString();
  return value ? `/dashboard/campaigns?${value}` : "/dashboard/campaigns";
}

function viewLabel(view: CampaignView) {
  const labels: Record<CampaignView, string> = {
    active: "Active",
    drafts: "Drafts",
    prepared: "Prepared",
    waiting: "Waiting for cron",
    sending: "Sending",
    sent: "Sent",
    failed: "Needs attention",
    all: "All",
  };
  return labels[view];
}

function parseView(value: string): CampaignView {
  return CAMPAIGN_VIEWS.includes(value as CampaignView)
    ? (value as CampaignView)
    : "active";
}

function parsePage(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function singleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function quotePostgrestValue(value: string) {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}
