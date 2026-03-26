import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST — Employee upserts their location
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { latitude, longitude, accuracy } = body;

  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return NextResponse.json({ error: "Coordinates out of range" }, { status: 400 });
  }

  const { error } = await supabase
    .from("employee_locations")
    .upsert(
      {
        user_id: user.id,
        latitude,
        longitude,
        accuracy: typeof accuracy === "number" ? accuracy : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// GET — Admin reads all currently clocked-in employees with their GPS location
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get all currently clocked-in employees (open shifts)
  const { data: openShifts, error: shiftsError } = await supabase
    .from("time_entries")
    .select("user_id, job_name, clock_in")
    .is("clock_out", null);

  if (shiftsError) {
    return NextResponse.json({ error: shiftsError.message }, { status: 500 });
  }

  const userIds = (openShifts ?? []).map((s) => s.user_id);

  if (userIds.length === 0) {
    return NextResponse.json({ locations: [] });
  }

  // Get their GPS locations and profiles in parallel
  const [locationRes, profileRes] = await Promise.all([
    supabase.from("employee_locations").select("*").in("user_id", userIds),
    supabase.from("profiles").select("id, full_name").in("id", userIds),
  ]);

  const locationMap = Object.fromEntries(
    (locationRes.data ?? []).map((l) => [l.user_id, l])
  );
  const profileMap = Object.fromEntries(
    (profileRes.data ?? []).map((p) => [p.id, p])
  );
  const shiftMap = Object.fromEntries(
    (openShifts ?? []).map((s) => [s.user_id, s])
  );

  const locations = userIds.map((uid) => ({
    id: locationMap[uid]?.id ?? uid,
    user_id: uid,
    latitude: locationMap[uid]?.latitude ?? null,
    longitude: locationMap[uid]?.longitude ?? null,
    accuracy: locationMap[uid]?.accuracy ?? null,
    updated_at: locationMap[uid]?.updated_at ?? null,
    profile: profileMap[uid] ?? null,
    job_name: shiftMap[uid]?.job_name ?? null,
    clock_in: shiftMap[uid]?.clock_in ?? null,
  }));

  return NextResponse.json({ locations });
}
