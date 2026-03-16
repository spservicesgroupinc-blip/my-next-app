import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const { email, password, full_name } = await req.json();

  if (!email || !password || !full_name) {
    return NextResponse.json(
      { error: "Email, password, and full name are required" },
      { status: 400 }
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters" },
      { status: 400 }
    );
  }

  // Use service role client so the role assignment is trusted (server-side only)
  const adminClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Create the auth user
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, role: "admin" },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const userId = data.user?.id;
  if (!userId) {
    return NextResponse.json(
      { error: "User creation succeeded but no user ID returned" },
      { status: 500 }
    );
  }

  // The DB trigger `handle_new_user` already runs on auth user creation and:
  //   1. Creates a brand-new company for this admin
  //   2. Creates a profile linked to that new company
  // We must NOT query all companies and pick an arbitrary one — that would
  // assign the new admin to an existing company (cross-tenant data leak).
  // Instead, check if the trigger did its job and fall back only if it failed.

  const { data: existingProfile } = await adminClient
    .from("profiles")
    .select("id, company_id")
    .eq("id", userId)
    .single();

  if (!existingProfile) {
    // Trigger failed — create a fresh company and profile from scratch
    const { data: newCompany, error: companyError } = await adminClient
      .from("companies")
      .insert({ name: `${full_name}'s Company` })
      .select("id")
      .single();

    if (companyError) {
      console.error("Failed to create company:", companyError.message);
      return NextResponse.json(
        { error: "Account created but company setup failed: " + companyError.message },
        { status: 500 }
      );
    }

    const { error: profileError } = await adminClient
      .from("profiles")
      .insert({
        id: userId,
        full_name,
        role: "admin",
        company_id: newCompany.id,
        hourly_rate: 0,
      });

    if (profileError) {
      console.error("Failed to create profile:", profileError.message);
      return NextResponse.json(
        { error: "Account created but profile setup failed: " + profileError.message },
        { status: 500 }
      );
    }
  } else if (!existingProfile.company_id) {
    // Profile exists but has no company (partial trigger failure) — create one now
    const { data: newCompany, error: companyError } = await adminClient
      .from("companies")
      .insert({ name: `${full_name}'s Company` })
      .select("id")
      .single();

    if (!companyError && newCompany) {
      await adminClient
        .from("profiles")
        .update({ role: "admin", company_id: newCompany.id })
        .eq("id", userId);
    }
  }
  // else: trigger created profile + company correctly — do NOT touch it

  return NextResponse.json({ success: true, userId });
}
