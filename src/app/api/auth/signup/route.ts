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

  // Ensure a company exists for this admin user
  // The DB trigger may have already created the profile + company,
  // so use upsert / conflict handling to avoid duplicates.
  let companyId: string | null = null;

  // Check if a company already exists (trigger may have created one)
  const { data: existingCompany } = await adminClient
    .from("companies")
    .select("id")
    .limit(1)
    .single();

  if (existingCompany) {
    companyId = existingCompany.id;
  } else {
    // Create a default company
    const { data: newCompany, error: companyError } = await adminClient
      .from("companies")
      .insert({ name: "My Company" })
      .select("id")
      .single();

    if (companyError) {
      console.error("Failed to create company:", companyError.message);
    } else {
      companyId = newCompany.id;
    }
  }

  // Ensure profile exists (trigger may have already created it)
  const { data: existingProfile } = await adminClient
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .single();

  if (!existingProfile) {
    const { error: profileError } = await adminClient
      .from("profiles")
      .insert({
        id: userId,
        full_name,
        role: "admin",
        company_id: companyId,
        hourly_rate: 0,
      });

    if (profileError) {
      console.error("Failed to create profile:", profileError.message);
      return NextResponse.json(
        { error: "Account created but profile setup failed: " + profileError.message },
        { status: 500 }
      );
    }
  } else {
    // Profile exists (from trigger) — ensure it has admin role and company
    await adminClient
      .from("profiles")
      .update({ role: "admin", company_id: companyId })
      .eq("id", userId);
  }

  return NextResponse.json({ success: true, userId });
}
