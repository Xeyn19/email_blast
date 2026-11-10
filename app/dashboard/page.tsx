import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import DashboardClient from "./dashboard-client";

export default function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  return (
    <Suspense fallback={<div className="p-8">Loading dashboard...</div>}>
      <DashboardContent searchParams={searchParams} />
    </Suspense>
  );
}

async function DashboardContent({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  await connection();

  const params = await searchParams;
  const initialView = params.view === "contacts" ? "Contacts" : "Overview";

  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/");
  }

  const fullName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : "";

  const name = fullName || user.email || "User";

  return (
    <DashboardClient
      user={{
        name,
        email: user.email ?? "",
      }}
      initialView={initialView}
    />
  );
}