import { redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import DashboardSidebar from "@/components/dashboard/dashboard-sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0b0b0b] p-8 text-white">Loading dashboard...</div>}>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </Suspense>
  );
}

async function DashboardLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {

    await connection();
    
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
    <div className="dashboard-layout">
      <DashboardSidebar
        user={{
          name,
          email: user.email ?? "",
        }}
      />

      <main className="dashboard-main">{children}</main>
    </div>
  );
}