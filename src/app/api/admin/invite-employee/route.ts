import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  // Verify caller is an admin
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabaseAuth
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  }

  const { email, password, full_name, hourly_rate } = await req.json();

  if (!email || !full_name || !password) {
    return NextResponse.json({ error: "email, full_name, and password are required" }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  // Use service role client to invite user
  const adminClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, company_id: profile.company_id },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Update the auto-created profile with name, rate, and correct company
  if (data?.user?.id) {
    await adminClient
      .from("profiles")
      .update({
        full_name,
        hourly_rate: hourly_rate ?? 0,
        company_id: profile.company_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.user.id);
  }

  return NextResponse.json({ success: true });
}
