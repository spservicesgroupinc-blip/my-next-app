import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateHoursBreakdown, computeEntryPay, parseDurationHours } from "@/lib/payCalculations";
import type { PayReportData, TimeEntryWithHours } from "@/lib/types";

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  // Authenticate
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const requestedEmployeeId = searchParams.get("employee_id") ?? user.id;

  if (!start || !end) {
    return NextResponse.json({ error: "start and end query params required (YYYY-MM-DD)" }, { status: 400 });
  }

  // Get requesting user's profile
  const { data: requesterProfile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, company_id, full_name, hourly_rate, is_active, created_at, updated_at")
    .eq("id", user.id)
    .single();

  if (profileError || !requesterProfile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Authorization: employees can only request their own report
  if (requestedEmployeeId !== user.id && requesterProfile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden: employees can only access their own reports" }, { status: 403 });
  }

  // Fetch target employee profile
  const { data: employeeProfile, error: empError } = await supabase
    .from("profiles")
    .select("id, role, company_id, full_name, hourly_rate, is_active, created_at, updated_at")
    .eq("id", requestedEmployeeId)
    .single();

  if (empError || !employeeProfile) {
    return NextResponse.json({ error: "Employee profile not found" }, { status: 404 });
  }

  // Verify same company
  if (employeeProfile.company_id !== requesterProfile.company_id) {
    return NextResponse.json({ error: "Forbidden: cross-company access denied" }, { status: 403 });
  }

  // Fetch company info
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name, address, phone, email, tax_id, created_at")
    .eq("id", employeeProfile.company_id)
    .single();

  if (companyError || !company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  // Fetch time entries in the date range (clock_in between start 00:00 and end 23:59:59)
  const { data: rawEntries, error: entriesError } = await supabase
    .from("time_entries")
    .select("id, user_id, job_name, clock_in, clock_out, hourly_rate, notes, company_id, created_at")
    .eq("user_id", requestedEmployeeId)
    .gte("clock_in", `${start}T00:00:00.000Z`)
    .lte("clock_in", `${end}T23:59:59.999Z`)
    .not("clock_out", "is", null)
    .order("clock_in", { ascending: true });

  if (entriesError) {
    return NextResponse.json({ error: entriesError.message }, { status: 500 });
  }

  // Enrich entries with calculated hours
  const entries: TimeEntryWithHours[] = (rawEntries ?? []).map((entry) => {
    const duration_hours = parseDurationHours(entry.clock_in, entry.clock_out);
    const breakdown = calculateHoursBreakdown(duration_hours);
    const entry_pay = computeEntryPay(breakdown, entry.hourly_rate);
    return {
      ...entry,
      duration_hours,
      regular_hours: breakdown.regular,
      overtime_hours: breakdown.overtime,
      doubletime_hours: breakdown.doubletime,
      entry_pay,
    };
  });

  // Sum totals
  const total_hours = entries.reduce((sum, e) => sum + e.duration_hours, 0);
  const regular_hours = entries.reduce((sum, e) => sum + e.regular_hours, 0);
  const overtime_hours = entries.reduce((sum, e) => sum + e.overtime_hours, 0);
  const doubletime_hours = entries.reduce((sum, e) => sum + e.doubletime_hours, 0);
  const gross_pay = entries.reduce((sum, e) => sum + e.entry_pay, 0);

  const reportData: PayReportData = {
    employee: employeeProfile,
    company,
    period_start: start,
    period_end: end,
    entries,
    total_hours: Math.round(total_hours * 100) / 100,
    regular_hours: Math.round(regular_hours * 100) / 100,
    overtime_hours: Math.round(overtime_hours * 100) / 100,
    doubletime_hours: Math.round(doubletime_hours * 100) / 100,
    gross_pay: Math.round(gross_pay * 100) / 100,
    generated_at: new Date().toISOString(),
  };

  return NextResponse.json(reportData);
}
