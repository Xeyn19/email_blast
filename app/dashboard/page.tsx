import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardClient from "./dashboard-client";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  // Redirect users who are not logged in.
  if (error || !user) {
    redirect("/");
  }

  // Get the user's registered name.
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
    />
  );
}