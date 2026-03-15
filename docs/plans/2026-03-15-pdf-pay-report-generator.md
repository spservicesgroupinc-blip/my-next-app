# PDF Pay Report Generator — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a full-featured PDF pay report generator that lets employees view their clock in/outs for any date range, generate a detailed PDF pay report, and submit it to their admin — with Supabase powering all data.

**Architecture:** Client-side PDF generation using `@react-pdf/renderer` (React component → PDF download). A `/api/pay/report` Next.js route fetches time entries + pay data from Supabase. Employees trigger the flow from a "Pay Report" button inside `TimeClockView`; a `PayReportModal` handles date range selection, preview summary, and submission. A new `pay_report_submissions` Supabase table tracks submissions with status workflow (`submitted` → `reviewed` → `approved`). Admins see incoming submissions in `AdminView`.

**Tech Stack:** Next.js 15 App Router, `@react-pdf/renderer` ^4, Supabase JS client (RLS), `date-fns` (already installed), Tailwind CSS, TypeScript, lucide-react icons

---

## Context

- **Working directory:** `.worktrees/feature/pdf-pay-report`
- **Key existing files:**
  - `src/lib/types.ts` — add new types here
  - `src/components/TimeClockView.tsx` — add "Pay Report" button
  - `src/components/AdminView.tsx` — add submitted reports section
  - `src/app/page.tsx` — wire PayReportModal state
  - `src/lib/supabase/client.ts` — import for Supabase client
  - `src/contexts/AuthContext.tsx` — `useAuth()` provides `user`, `profile`, `isAdmin`
- **Database tables used:**
  - `time_entries` — clock in/out records (user_id, job_name, clock_in, clock_out, hourly_rate, notes, company_id)
  - `profiles` — employee info (id, full_name, role, hourly_rate, company_id)
  - `companies` — company info (id, name, address, phone, email)
  - `pay_report_submissions` — NEW table for tracking submitted reports
- **Auth pattern:** All Supabase clients use `createClient()` from `@/lib/supabase/client`. API routes use service role client via `createClient()` from `@/lib/supabase/server`. RLS is enforced on all tables.

---

### Task 1: Install @react-pdf/renderer

**Files:**
- Modify: `package.json` (via npm install)

**Step 1: Install the package**

Run from `.worktrees/feature/pdf-pay-report/`:
```bash
npm install @react-pdf/renderer
```

**Step 2: Verify installation**

Run:
```bash
node -e "require('@react-pdf/renderer'); console.log('ok')"
```
Expected: `ok`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install @react-pdf/renderer for PDF generation"
```

---

### Task 2: Add TypeScript types for pay reports

**Files:**
- Modify: `src/lib/types.ts`

**Step 1: Write a failing type-check test**

Create `src/lib/__tests__/payReportTypes.test.ts`:
```typescript
import type { PayReportData, PayReportSubmission, TimeEntryWithHours } from "@/lib/types";

// Type-level tests — TypeScript will fail at compile time if types are wrong
const entry: TimeEntryWithHours = {
  id: "1",
  user_id: "u1",
  job_name: "Test Job",
  clock_in: "2026-03-10T08:00:00Z",
  clock_out: "2026-03-10T16:00:00Z",
  hourly_rate: 25,
  notes: null,
  company_id: "c1",
  created_at: "2026-03-10T08:00:00Z",
  duration_hours: 8,
  regular_hours: 8,
  overtime_hours: 0,
  doubletime_hours: 0,
  entry_pay: 200,
};

const report: PayReportData = {
  employee: { id: "u1", full_name: "Jane Doe", hourly_rate: 25, company_id: "c1", role: "employee", is_active: true, created_at: "", updated_at: "" },
  company: { id: "c1", name: "Acme Inc", address: null, phone: null, email: null, tax_id: null, created_at: "" },
  period_start: "2026-03-01",
  period_end: "2026-03-15",
  entries: [entry],
  total_hours: 8,
  regular_hours: 8,
  overtime_hours: 0,
  doubletime_hours: 0,
  gross_pay: 200,
  generated_at: "2026-03-15T12:00:00Z",
};

const submission: PayReportSubmission = {
  id: "s1",
  employee_id: "u1",
  company_id: "c1",
  period_start: "2026-03-01",
  period_end: "2026-03-15",
  total_hours: 8,
  gross_pay: 200,
  status: "submitted",
  notes: null,
  submitted_at: "2026-03-15T12:00:00Z",
  reviewed_at: null,
  reviewed_by: null,
  created_at: "2026-03-15T12:00:00Z",
};

export { entry, report, submission }; // Force TypeScript to check
```

**Step 2: Run to verify it fails (types missing)**

Run:
```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: errors about `PayReportData`, `PayReportSubmission`, `TimeEntryWithHours` not found

**Step 3: Add types to `src/lib/types.ts`**

Append to `src/lib/types.ts`:
```typescript
// ─── Company (matches public.companies) ───────────────────────────────────────
export interface Company {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  tax_id: string | null;
  created_at: string;
}

// ─── TimeEntryWithHours — time entry enriched with calculated hour breakdown ──
export interface TimeEntryWithHours extends TimeEntry {
  duration_hours: number;
  regular_hours: number;
  overtime_hours: number;
  doubletime_hours: number;
  entry_pay: number;
}

// ─── PayReportData — full data needed to render the PDF ───────────────────────
export interface PayReportData {
  employee: Profile;
  company: Company;
  period_start: string;    // YYYY-MM-DD
  period_end: string;      // YYYY-MM-DD
  entries: TimeEntryWithHours[];
  total_hours: number;
  regular_hours: number;
  overtime_hours: number;
  doubletime_hours: number;
  gross_pay: number;
  generated_at: string;    // ISO timestamp
}

// ─── PayReportSubmission (matches public.pay_report_submissions) ───────────────
export interface PayReportSubmission {
  id: string;
  employee_id: string;
  company_id: string;
  period_start: string;
  period_end: string;
  total_hours: number;
  gross_pay: number;
  status: "submitted" | "reviewed" | "approved";
  notes: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  // Joined fields
  employee?: Pick<Profile, "id" | "full_name">;
}
```

**Step 4: Run type check to verify it passes**

Run:
```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors related to the new types

**Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/__tests__/payReportTypes.test.ts
git commit -m "feat: add PayReportData, PayReportSubmission, TimeEntryWithHours types"
```

---

### Task 3: Supabase migration — pay_report_submissions table

**Files:**
- Create: `supabase/migrations/20260315000001_pay_report_submissions.sql`

**Step 1: Create the migration file**

Create `supabase/migrations/20260315000001_pay_report_submissions.sql`:
```sql
-- ─── pay_report_submissions ────────────────────────────────────────────────────
-- Tracks PDF pay reports submitted by employees to their admin for review.

CREATE TABLE IF NOT EXISTS public.pay_report_submissions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_id        uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_start      date        NOT NULL,
  period_end        date        NOT NULL,
  total_hours       numeric(8,2) NOT NULL DEFAULT 0,
  gross_pay         numeric(10,2) NOT NULL DEFAULT 0,
  status            text        NOT NULL DEFAULT 'submitted'
                                CHECK (status IN ('submitted','reviewed','approved')),
  notes             text,
  submitted_at      timestamptz NOT NULL DEFAULT now(),
  reviewed_at       timestamptz,
  reviewed_by       uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_pay_report_submissions_employee ON public.pay_report_submissions(employee_id);
CREATE INDEX idx_pay_report_submissions_company  ON public.pay_report_submissions(company_id);
CREATE INDEX idx_pay_report_submissions_status   ON public.pay_report_submissions(status);
CREATE INDEX idx_pay_report_submissions_period   ON public.pay_report_submissions(period_start, period_end);

-- Enable Row Level Security
ALTER TABLE public.pay_report_submissions ENABLE ROW LEVEL SECURITY;

-- Employees can see their own submissions
CREATE POLICY "employees_select_own_submissions"
  ON public.pay_report_submissions
  FOR SELECT
  USING (auth.uid() = employee_id);

-- Admins can see all submissions in their company
CREATE POLICY "admins_select_company_submissions"
  ON public.pay_report_submissions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
        AND company_id = pay_report_submissions.company_id
    )
  );

-- Employees can insert their own submissions
CREATE POLICY "employees_insert_own_submissions"
  ON public.pay_report_submissions
  FOR INSERT
  WITH CHECK (auth.uid() = employee_id);

-- Admins can update status (reviewed/approved)
CREATE POLICY "admins_update_submissions"
  ON public.pay_report_submissions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
        AND company_id = pay_report_submissions.company_id
    )
  );
```

**Step 2: Apply migration via Supabase MCP**

Use `mcp__665f077d-cc78-4232-9702-9406acca7579__apply_migration` with the SQL above.

**Step 3: Verify table was created**

Use `mcp__665f077d-cc78-4232-9702-9406acca7579__list_tables` — confirm `pay_report_submissions` appears.

**Step 4: Commit**

```bash
git add supabase/migrations/20260315000001_pay_report_submissions.sql
git commit -m "feat: add pay_report_submissions table with RLS policies"
```

---

### Task 4: Create pay report API endpoint

**Files:**
- Create: `src/app/api/pay/report/route.ts`

**Step 1: Understand what the endpoint must return**

`GET /api/pay/report?start=YYYY-MM-DD&end=YYYY-MM-DD&employee_id=<uuid>`

- `start` / `end` — date range (required)
- `employee_id` — optional; if omitted returns data for the authenticated user; if provided, only admins can request other employees

**Returns:** `PayReportData` JSON

Hours calculation rules (standard construction/contractor):
- Hours 0–8 per day → regular hours at 1x rate
- Hours 8–12 per day → overtime at 1.5x rate
- Hours >12 per day → doubletime at 2x rate

**Step 2: Write a test for the calculation helper**

Create `src/lib/__tests__/payCalculations.test.ts`:
```typescript
import { calculateHoursBreakdown, computeEntryPay } from "@/lib/payCalculations";

test("8h day = 8 regular, 0 OT, 0 DT", () => {
  const result = calculateHoursBreakdown(8);
  expect(result.regular).toBe(8);
  expect(result.overtime).toBe(0);
  expect(result.doubletime).toBe(0);
});

test("10h day = 8 regular, 2 OT, 0 DT", () => {
  const result = calculateHoursBreakdown(10);
  expect(result.regular).toBe(8);
  expect(result.overtime).toBe(2);
  expect(result.doubletime).toBe(0);
});

test("14h day = 8 regular, 4 OT, 2 DT", () => {
  const result = calculateHoursBreakdown(14);
  expect(result.regular).toBe(8);
  expect(result.overtime).toBe(4);
  expect(result.doubletime).toBe(2);
});

test("computeEntryPay at $20/h for 10h day = 8*20 + 2*30 = 220", () => {
  const pay = computeEntryPay({ regular: 8, overtime: 2, doubletime: 0 }, 20);
  expect(pay).toBeCloseTo(220);
});
```

**Step 3: Run test to verify it fails (helper not created yet)**

Run:
```bash
npx jest src/lib/__tests__/payCalculations.test.ts 2>&1 | tail -10
```
Expected: error `Cannot find module '@/lib/payCalculations'`

**Step 4: Create `src/lib/payCalculations.ts`**

```typescript
// ─── Pay Calculation Helpers ──────────────────────────────────────────────────

export interface HoursBreakdown {
  regular: number;
  overtime: number;
  doubletime: number;
}

/**
 * Splits total daily hours into regular / overtime / doubletime.
 * Rules:
 *   0–8h   → regular  (1x)
 *   8–12h  → overtime (1.5x)
 *   12h+   → doubletime (2x)
 */
export function calculateHoursBreakdown(totalHours: number): HoursBreakdown {
  const regular = Math.min(totalHours, 8);
  const overtime = Math.max(0, Math.min(totalHours - 8, 4));
  const doubletime = Math.max(0, totalHours - 12);
  return {
    regular: Math.round(regular * 100) / 100,
    overtime: Math.round(overtime * 100) / 100,
    doubletime: Math.round(doubletime * 100) / 100,
  };
}

/**
 * Calculates gross pay for a single entry given hour breakdown and hourly rate.
 */
export function computeEntryPay(breakdown: HoursBreakdown, hourlyRate: number): number {
  const pay =
    breakdown.regular * hourlyRate +
    breakdown.overtime * hourlyRate * 1.5 +
    breakdown.doubletime * hourlyRate * 2;
  return Math.round(pay * 100) / 100;
}

/**
 * Parses duration in hours from clock_in and clock_out ISO strings.
 * Returns 0 for open entries (no clock_out).
 */
export function parseDurationHours(clockIn: string, clockOut: string | null): number {
  if (!clockOut) return 0;
  const ms = new Date(clockOut).getTime() - new Date(clockIn).getTime();
  return Math.round((ms / 3_600_000) * 100) / 100;
}
```

**Step 5: Run tests to verify they pass**

Run:
```bash
npx jest src/lib/__tests__/payCalculations.test.ts 2>&1 | tail -10
```
Expected: all 4 tests pass

**Step 6: Create `src/app/api/pay/report/route.ts`**

```typescript
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
    .not("clock_out", "is", null)   // only completed entries
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
```

**Step 7: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "api/pay/report"
```
Expected: no errors

**Step 8: Commit**

```bash
git add src/lib/payCalculations.ts src/lib/__tests__/payCalculations.test.ts src/app/api/pay/report/route.ts
git commit -m "feat: add pay report API endpoint with hours calculation helper"
```

---

### Task 5: Create PDF template component

**Files:**
- Create: `src/components/pay/PayReportPDF.tsx`

**Step 1: Check @react-pdf/renderer exports compile**

Create `src/components/pay/__tests__/PayReportPDF.types.test.ts`:
```typescript
// Compile-time test: verify @react-pdf/renderer is importable
import { Document, Page, Text, View } from "@react-pdf/renderer";
export { Document, Page, Text, View };
```

Run:
```bash
npx tsc --noEmit 2>&1 | grep "PayReportPDF"
```
Expected: no errors

**Step 2: Create `src/components/pay/PayReportPDF.tsx`**

```tsx
"use client";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { format, parseISO } from "date-fns";
import type { PayReportData } from "@/lib/types";

// ─── Styles ───────────────────────────────────────────────────────────────────
const colors = {
  primary: "#ea580c",   // orange-600
  dark: "#0f172a",      // slate-900
  medium: "#475569",    // slate-600
  light: "#94a3b8",     // slate-400
  border: "#e2e8f0",    // slate-200
  rowAlt: "#f8fafc",    // slate-50
  white: "#ffffff",
  headerBg: "#1e293b",  // slate-800
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: colors.dark,
    paddingTop: 36,
    paddingBottom: 50,
    paddingHorizontal: 36,
    backgroundColor: colors.white,
  },

  // ── Header ──
  headerSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  companyBlock: { flexDirection: "column", gap: 2 },
  companyName: { fontSize: 18, fontFamily: "Helvetica-Bold", color: colors.dark },
  companyMeta: { fontSize: 8, color: colors.medium },
  reportTitleBlock: { flexDirection: "column", alignItems: "flex-end", gap: 2 },
  reportTitle: { fontSize: 14, fontFamily: "Helvetica-Bold", color: colors.primary },
  reportPeriod: { fontSize: 9, color: colors.medium },

  // ── Employee Info Card ──
  infoCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: colors.rowAlt,
    borderRadius: 4,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoGroup: { flexDirection: "column", gap: 3 },
  infoLabel: { fontSize: 7, color: colors.light, textTransform: "uppercase", letterSpacing: 0.5 },
  infoValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: colors.dark },

  // ── Section heading ──
  sectionHeading: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: colors.medium,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 4,
  },

  // ── Table ──
  tableHeader: {
    flexDirection: "row",
    backgroundColor: colors.headerBg,
    borderRadius: 3,
    paddingVertical: 5,
    paddingHorizontal: 4,
    marginBottom: 1,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  tableRowAlt: { backgroundColor: colors.rowAlt },

  // Column widths (total = 100%)
  colDate:     { width: "10%", fontSize: 8 },
  colDay:      { width: "7%",  fontSize: 8 },
  colJob:      { width: "22%", fontSize: 8 },
  colClockIn:  { width: "12%", fontSize: 8 },
  colClockOut: { width: "12%", fontSize: 8 },
  colHours:    { width: "8%",  fontSize: 8, textAlign: "right" },
  colRegular:  { width: "7%",  fontSize: 8, textAlign: "right" },
  colOT:       { width: "6%",  fontSize: 8, textAlign: "right" },
  colDT:       { width: "6%",  fontSize: 8, textAlign: "right" },
  colRate:     { width: "5%",  fontSize: 8, textAlign: "right" },
  colPay:      { width: "5%",  fontSize: 8, textAlign: "right" },

  tableHeaderText: { color: colors.white, fontFamily: "Helvetica-Bold", fontSize: 7, textTransform: "uppercase" },

  // ── Summary ──
  summarySection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
    gap: 8,
  },
  summaryBox: {
    flex: 1,
    padding: 10,
    backgroundColor: colors.rowAlt,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "column",
    gap: 4,
  },
  summaryBoxTitle: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: colors.medium, textTransform: "uppercase", marginBottom: 2 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryLabel: { fontSize: 8.5, color: colors.medium },
  summaryValue: { fontSize: 8.5, color: colors.dark },
  summaryTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 4,
    marginTop: 2,
  },
  summaryTotalLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", color: colors.dark },
  summaryTotalValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: colors.primary },

  // ── Gross pay highlight box ──
  grossPayBox: {
    alignItems: "flex-end",
    padding: 14,
    backgroundColor: colors.headerBg,
    borderRadius: 4,
    minWidth: 140,
    gap: 4,
  },
  grossPayLabel: { fontSize: 8, color: colors.light, textTransform: "uppercase", letterSpacing: 0.5 },
  grossPayAmount: { fontSize: 22, fontFamily: "Helvetica-Bold", color: colors.white },
  grossPaySub: { fontSize: 7, color: colors.light },

  // ── Footer ──
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    paddingTop: 6,
  },
  footerText: { fontSize: 7, color: colors.light },

  // ── No entries ──
  noEntries: { textAlign: "center", color: colors.light, paddingVertical: 20, fontSize: 9 },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(isoString: string, pattern: string): string {
  try { return format(parseISO(isoString), pattern); }
  catch { return "—"; }
}
function fmtDate(s: string) { return fmt(s, "MMM d, yyyy"); }
function fmtTime(s: string | null) { return s ? fmt(s, "h:mm a") : "—"; }
function fmtHrs(n: number) { return n.toFixed(2); }
function fmtPay(n: number) { return `$${n.toFixed(2)}`; }

// ─── Component ────────────────────────────────────────────────────────────────
interface PayReportPDFProps {
  data: PayReportData;
}

export function PayReportPDF({ data }: PayReportPDFProps) {
  const {
    employee, company, period_start, period_end,
    entries, total_hours, regular_hours, overtime_hours,
    doubletime_hours, gross_pay, generated_at,
  } = data;

  return (
    <Document
      title={`Pay Report — ${employee.full_name} — ${fmtDate(period_start)} to ${fmtDate(period_end)}`}
      author={company.name}
      creator="ProTask Pay System"
    >
      <Page size="LETTER" orientation="landscape" style={styles.page}>

        {/* ── Header ── */}
        <View style={styles.headerSection}>
          <View style={styles.companyBlock}>
            <Text style={styles.companyName}>{company.name}</Text>
            {company.address && <Text style={styles.companyMeta}>{company.address}</Text>}
            {company.phone && <Text style={styles.companyMeta}>{company.phone}</Text>}
            {company.email && <Text style={styles.companyMeta}>{company.email}</Text>}
            {company.tax_id && <Text style={styles.companyMeta}>Tax ID: {company.tax_id}</Text>}
          </View>
          <View style={styles.reportTitleBlock}>
            <Text style={styles.reportTitle}>PAY REPORT</Text>
            <Text style={styles.reportPeriod}>
              {fmtDate(period_start)} — {fmtDate(period_end)}
            </Text>
            <Text style={styles.reportPeriod}>Generated {fmt(generated_at, "MMM d, yyyy h:mm a")}</Text>
          </View>
        </View>

        {/* ── Employee Info Card ── */}
        <View style={styles.infoCard}>
          <View style={styles.infoGroup}>
            <Text style={styles.infoLabel}>Employee Name</Text>
            <Text style={styles.infoValue}>{employee.full_name}</Text>
          </View>
          <View style={styles.infoGroup}>
            <Text style={styles.infoLabel}>Base Hourly Rate</Text>
            <Text style={styles.infoValue}>{fmtPay(employee.hourly_rate)} / hr</Text>
          </View>
          <View style={styles.infoGroup}>
            <Text style={styles.infoLabel}>Pay Period</Text>
            <Text style={styles.infoValue}>{fmtDate(period_start)} – {fmtDate(period_end)}</Text>
          </View>
          <View style={styles.infoGroup}>
            <Text style={styles.infoLabel}>Total Entries</Text>
            <Text style={styles.infoValue}>{entries.length}</Text>
          </View>
          <View style={styles.infoGroup}>
            <Text style={styles.infoLabel}>Employee ID</Text>
            <Text style={styles.infoValue}>{employee.id.slice(0, 8).toUpperCase()}</Text>
          </View>
        </View>

        {/* ── Time Entries Table ── */}
        <Text style={styles.sectionHeading}>Time Entry Detail</Text>

        {/* Table Header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.colDate,     styles.tableHeaderText]}>Date</Text>
          <Text style={[styles.colDay,      styles.tableHeaderText]}>Day</Text>
          <Text style={[styles.colJob,      styles.tableHeaderText]}>Job / Project</Text>
          <Text style={[styles.colClockIn,  styles.tableHeaderText]}>Clock In</Text>
          <Text style={[styles.colClockOut, styles.tableHeaderText]}>Clock Out</Text>
          <Text style={[styles.colHours,    styles.tableHeaderText]}>Total Hrs</Text>
          <Text style={[styles.colRegular,  styles.tableHeaderText]}>Reg Hrs</Text>
          <Text style={[styles.colOT,       styles.tableHeaderText]}>OT Hrs</Text>
          <Text style={[styles.colDT,       styles.tableHeaderText]}>DT Hrs</Text>
          <Text style={[styles.colRate,     styles.tableHeaderText]}>Rate</Text>
          <Text style={[styles.colPay,      styles.tableHeaderText]}>Pay</Text>
        </View>

        {/* Table Rows */}
        {entries.length === 0 ? (
          <Text style={styles.noEntries}>No completed time entries found for this period.</Text>
        ) : (
          entries.map((entry, idx) => (
            <View
              key={entry.id}
              style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowAlt : {}]}
            >
              <Text style={styles.colDate}>{fmt(entry.clock_in, "MM/dd/yy")}</Text>
              <Text style={styles.colDay}>{fmt(entry.clock_in, "EEE")}</Text>
              <Text style={styles.colJob} numberOfLines={1}>{entry.job_name}</Text>
              <Text style={styles.colClockIn}>{fmtTime(entry.clock_in)}</Text>
              <Text style={styles.colClockOut}>{fmtTime(entry.clock_out)}</Text>
              <Text style={styles.colHours}>{fmtHrs(entry.duration_hours)}</Text>
              <Text style={styles.colRegular}>{fmtHrs(entry.regular_hours)}</Text>
              <Text style={[styles.colOT, entry.overtime_hours > 0 ? { color: "#d97706" } : {}]}>
                {fmtHrs(entry.overtime_hours)}
              </Text>
              <Text style={[styles.colDT, entry.doubletime_hours > 0 ? { color: "#dc2626" } : {}]}>
                {fmtHrs(entry.doubletime_hours)}
              </Text>
              <Text style={styles.colRate}>${entry.hourly_rate.toFixed(0)}</Text>
              <Text style={[styles.colPay, { fontFamily: "Helvetica-Bold" }]}>{fmtPay(entry.entry_pay)}</Text>
            </View>
          ))
        )}

        {/* ── Summary + Gross Pay ── */}
        <View style={styles.summarySection}>

          {/* Hours breakdown */}
          <View style={styles.summaryBox}>
            <Text style={styles.summaryBoxTitle}>Hours Summary</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Regular Hours</Text>
              <Text style={styles.summaryValue}>{fmtHrs(regular_hours)} hrs @ 1x</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Overtime Hours</Text>
              <Text style={styles.summaryValue}>{fmtHrs(overtime_hours)} hrs @ 1.5x</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Doubletime Hours</Text>
              <Text style={styles.summaryValue}>{fmtHrs(doubletime_hours)} hrs @ 2x</Text>
            </View>
            <View style={styles.summaryTotalRow}>
              <Text style={styles.summaryTotalLabel}>Total Hours</Text>
              <Text style={styles.summaryTotalValue}>{fmtHrs(total_hours)} hrs</Text>
            </View>
          </View>

          {/* Pay breakdown */}
          <View style={styles.summaryBox}>
            <Text style={styles.summaryBoxTitle}>Pay Breakdown</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Regular Pay</Text>
              <Text style={styles.summaryValue}>{fmtPay(regular_hours * employee.hourly_rate)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Overtime Pay</Text>
              <Text style={styles.summaryValue}>{fmtPay(overtime_hours * employee.hourly_rate * 1.5)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Doubletime Pay</Text>
              <Text style={styles.summaryValue}>{fmtPay(doubletime_hours * employee.hourly_rate * 2)}</Text>
            </View>
            <View style={styles.summaryTotalRow}>
              <Text style={styles.summaryTotalLabel}>Gross Pay</Text>
              <Text style={styles.summaryTotalValue}>{fmtPay(gross_pay)}</Text>
            </View>
          </View>

          {/* Gross pay highlight */}
          <View style={styles.grossPayBox}>
            <Text style={styles.grossPayLabel}>Total Gross Pay</Text>
            <Text style={styles.grossPayAmount}>{fmtPay(gross_pay)}</Text>
            <Text style={styles.grossPaySub}>
              {fmtHrs(total_hours)} total hrs · {entries.length} entries
            </Text>
          </View>
        </View>

        {/* ── Footer ── */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {company.name} · Pay Report · {employee.full_name}
          </Text>
          <Text style={styles.footerText}>
            Generated {fmt(generated_at, "MMM d, yyyy 'at' h:mm a")} · CONFIDENTIAL
          </Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}`
          } />
        </View>

      </Page>
    </Document>
  );
}
```

**Step 3: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "PayReportPDF"
```
Expected: no errors

**Step 4: Commit**

```bash
git add src/components/pay/PayReportPDF.tsx
git commit -m "feat: add PayReportPDF component using @react-pdf/renderer"
```

---

### Task 6: Create PayReportModal component

**Files:**
- Create: `src/components/pay/PayReportModal.tsx`

The modal is a full-screen overlay containing:
1. Date range picker (Start date / End date inputs)
2. Quick date range presets (This Week, Last Week, This Month, Last Month, Last 2 Weeks)
3. Summary cards showing hours/pay before download
4. "Download PDF" button (client-side, no server round-trip for PDF)
5. "Submit to Admin" button (saves submission to Supabase)

**Step 1: Create `src/components/pay/PayReportModal.tsx`**

```tsx
"use client";

import { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths } from "date-fns";
import { X, Download, Send, Calendar, Clock, DollarSign, FileText, ChevronDown, Loader2, CheckCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { PayReportData } from "@/lib/types";

// Lazy-load PDF components to avoid SSR issues with @react-pdf/renderer
const PDFDownloadLink = dynamic(
  () => import("@react-pdf/renderer").then((mod) => mod.PDFDownloadLink),
  { ssr: false }
);
const PayReportPDF = dynamic(
  () => import("./PayReportPDF").then((mod) => mod.PayReportPDF),
  { ssr: false }
);

// ─── Date range presets ────────────────────────────────────────────────────────
function getPresets(): { label: string; start: string; end: string }[] {
  const today = new Date();
  const fmt = (d: Date) => format(d, "yyyy-MM-dd");
  return [
    { label: "This Week",   start: fmt(startOfWeek(today, { weekStartsOn: 1 })), end: fmt(endOfWeek(today, { weekStartsOn: 1 })) },
    { label: "Last Week",   start: fmt(startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 })), end: fmt(endOfWeek(subWeeks(today, 1), { weekStartsOn: 1 })) },
    { label: "Last 2 Weeks",start: fmt(startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 })), end: fmt(endOfWeek(today, { weekStartsOn: 1 })) },
    { label: "This Month",  start: fmt(startOfMonth(today)), end: fmt(endOfMonth(today)) },
    { label: "Last Month",  start: fmt(startOfMonth(subMonths(today, 1))), end: fmt(endOfMonth(subMonths(today, 1))) },
  ];
}

// ─── SummaryCard ──────────────────────────────────────────────────────────────
function SummaryCard({ label, value, icon: Icon, sub }: { label: string; value: string; icon: React.ElementType; sub?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-orange-500" />
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
      </div>
      <span className="text-xl font-bold text-slate-900">{value}</span>
      {sub && <span className="text-xs text-slate-400">{sub}</span>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface PayReportModalProps {
  onClose: () => void;
  /** If provided (admin use), generates report for this employee instead of current user */
  targetEmployeeId?: string;
  targetEmployeeName?: string;
}

export default function PayReportModal({ onClose, targetEmployeeId, targetEmployeeName }: PayReportModalProps) {
  const { user, profile } = useAuth();
  const supabase = createClient();

  const presets = getPresets();

  // Default to "Last Week"
  const [startDate, setStartDate] = useState(presets[1].start);
  const [endDate, setEndDate] = useState(presets[1].end);
  const [activePreset, setActivePreset] = useState("Last Week");

  const [reportData, setReportData] = useState<PayReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "submitting" | "submitted" | "error">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const applyPreset = useCallback((preset: { label: string; start: string; end: string }) => {
    setStartDate(preset.start);
    setEndDate(preset.end);
    setActivePreset(preset.label);
    setReportData(null);
    setError(null);
  }, []);

  const fetchReport = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    setError(null);
    setReportData(null);
    setSubmitStatus("idle");

    const employeeId = targetEmployeeId ?? user?.id;
    const params = new URLSearchParams({ start: startDate, end: endDate });
    if (employeeId) params.set("employee_id", employeeId);

    const res = await fetch(`/api/pay/report?${params.toString()}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to load report data");
      setLoading(false);
      return;
    }

    const data: PayReportData = await res.json();
    setReportData(data);
    setLoading(false);
  }, [startDate, endDate, targetEmployeeId, user?.id]);

  // Auto-fetch when dates change
  useEffect(() => {
    if (startDate && endDate && startDate <= endDate) fetchReport();
  }, [startDate, endDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = useCallback(async () => {
    if (!reportData || !profile) return;
    setSubmitStatus("submitting");
    setSubmitError(null);

    const { error: insertError } = await supabase
      .from("pay_report_submissions")
      .insert({
        employee_id: targetEmployeeId ?? user!.id,
        company_id: profile.company_id,
        period_start: reportData.period_start,
        period_end: reportData.period_end,
        total_hours: reportData.total_hours,
        gross_pay: reportData.gross_pay,
        status: "submitted",
      });

    if (insertError) {
      setSubmitStatus("error");
      setSubmitError(insertError.message);
      return;
    }

    setSubmitStatus("submitted");
  }, [reportData, profile, supabase, targetEmployeeId, user]);

  const pdfFilename = reportData
    ? `pay-report-${reportData.employee.full_name.replace(/\s+/g, "-").toLowerCase()}-${startDate}-to-${endDate}.pdf`
    : "pay-report.pdf";

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-white">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100">
            <FileText className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Pay Report{targetEmployeeName ? ` — ${targetEmployeeName}` : ""}
            </h2>
            <p className="text-xs text-slate-500">Generate & download your detailed pay report</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

        {/* ── Date Range Section ── */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-400" />
            Pay Period
          </h3>

          {/* Quick presets */}
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  activePreset === p.label
                    ? "bg-orange-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Manual date inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                max={endDate}
                onChange={(e) => { setStartDate(e.target.value); setActivePreset("Custom"); setReportData(null); }}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                max={format(new Date(), "yyyy-MM-dd")}
                onChange={(e) => { setEndDate(e.target.value); setActivePreset("Custom"); setReportData(null); }}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
              />
            </div>
          </div>
        </div>

        {/* ── Loading state ── */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
            <span className="text-sm text-slate-500">Fetching your time entries…</span>
          </div>
        )}

        {/* ── Error state ── */}
        {error && !loading && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* ── Report summary ── */}
        {reportData && !loading && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3">
              <SummaryCard
                label="Total Hours"
                value={`${reportData.total_hours.toFixed(2)} hrs`}
                icon={Clock}
                sub={`${reportData.entries.length} time entries`}
              />
              <SummaryCard
                label="Gross Pay"
                value={`$${reportData.gross_pay.toFixed(2)}`}
                icon={DollarSign}
                sub={`@ $${reportData.employee.hourly_rate}/hr base`}
              />
              {reportData.overtime_hours > 0 && (
                <SummaryCard
                  label="Overtime Hours"
                  value={`${reportData.overtime_hours.toFixed(2)} hrs`}
                  icon={Clock}
                  sub="Paid at 1.5x rate"
                />
              )}
              {reportData.doubletime_hours > 0 && (
                <SummaryCard
                  label="Doubletime Hours"
                  value={`${reportData.doubletime_hours.toFixed(2)} hrs`}
                  icon={Clock}
                  sub="Paid at 2x rate"
                />
              )}
            </div>

            {/* Time entries preview list */}
            {reportData.entries.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700">Time Entries</span>
                  <span className="text-xs text-slate-400">{reportData.entries.length} entries</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {reportData.entries.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-900">
                            {format(new Date(entry.clock_in), "EEE MMM d")}
                          </span>
                          {entry.overtime_hours > 0 && (
                            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">OT</span>
                          )}
                          {entry.doubletime_hours > 0 && (
                            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">DT</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 truncate">
                          {entry.job_name} · {format(new Date(entry.clock_in), "h:mm a")} → {entry.clock_out ? format(new Date(entry.clock_out), "h:mm a") : "—"}
                        </div>
                        {entry.notes && (
                          <div className="text-xs text-slate-400 mt-0.5 truncate italic">{entry.notes}</div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-0.5 ml-3 flex-shrink-0">
                        <span className="text-sm font-bold text-slate-900">${entry.entry_pay.toFixed(2)}</span>
                        <span className="text-xs text-slate-400">{entry.duration_hours.toFixed(2)} hrs</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {reportData.entries.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
                <Clock className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-500">No completed time entries</p>
                <p className="text-xs text-slate-400 mt-1">Try selecting a different date range.</p>
              </div>
            )}

            {/* Submit success */}
            {submitStatus === "submitted" && (
              <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
                <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-800">Report submitted to admin</p>
                  <p className="text-xs text-green-600 mt-0.5">Your admin has been notified and can review your submission.</p>
                </div>
              </div>
            )}

            {submitStatus === "error" && submitError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <strong>Submit failed:</strong> {submitError}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Bottom action bar ── */}
      {reportData && !loading && (
        <div className="border-t border-slate-100 bg-white px-4 py-4 flex flex-col gap-2 flex-shrink-0"
             style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>

          {/* Download PDF button (lazy-loaded) */}
          <PDFDownloadLink
            document={<PayReportPDF data={reportData} />}
            fileName={pdfFilename}
            className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
          >
            {({ loading: pdfLoading }) =>
              pdfLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Preparing PDF…</span>
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  <span>Download PDF Report</span>
                </>
              )
            }
          </PDFDownloadLink>

          {/* Submit to admin button */}
          <button
            onClick={handleSubmit}
            disabled={submitStatus === "submitting" || submitStatus === "submitted" || reportData.entries.length === 0}
            className="flex items-center justify-center gap-2 rounded-xl bg-orange-600 py-3 text-sm font-semibold text-white hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitStatus === "submitting" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Submitting…</span>
              </>
            ) : submitStatus === "submitted" ? (
              <>
                <CheckCircle className="h-4 w-4" />
                <span>Submitted</span>
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                <span>Submit Report to Admin</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
```

**Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "PayReportModal"
```
Expected: no errors

**Step 3: Commit**

```bash
git add src/components/pay/PayReportModal.tsx
git commit -m "feat: add PayReportModal with date presets, summary, download, and submit"
```

---

### Task 7: Wire PayReportModal into TimeClockView and main page

**Files:**
- Modify: `src/components/TimeClockView.tsx` (add "Pay Report" button)
- Modify: `src/app/page.tsx` (add modal state + render)

**Step 1: Read current TimeClockView to find the right insertion point**

Read `src/components/TimeClockView.tsx` — look for the main action area (clock in/out buttons, header) to place the "Pay Report" button.

**Step 2: Add props to TimeClockView**

Add `onOpenPayReport: () => void` to the `TimeClockViewProps` interface in `TimeClockView.tsx`.

Add a "Pay Report" button (using `FileText` icon from lucide-react) to the header area:
```tsx
<button
  onClick={onOpenPayReport}
  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:border-orange-300 hover:text-orange-700 transition-colors"
>
  <FileText className="h-3.5 w-3.5" />
  Pay Report
</button>
```
Place this button in the top-right area of the TimeClockView header, alongside any existing controls.

**Step 3: Read `src/app/page.tsx` to find the import section and render section**

Find:
- The import block at the top
- Where `showTimeEntryModal` state is declared
- Where `<TimeClockView>` is rendered
- Where `{showTimeEntryModal && <TimeEntryModal ... />}` is rendered

**Step 4: Modify `src/app/page.tsx`**

Add these changes:
1. Import `PayReportModal`:
   ```tsx
   import PayReportModal from "@/components/pay/PayReportModal";
   ```
2. Add state:
   ```tsx
   const [showPayReportModal, setShowPayReportModal] = useState(false);
   ```
3. Pass prop to TimeClockView:
   ```tsx
   <TimeClockView
     timeEntries={timeEntries}
     onClockIn={handleClockIn}
     onClockOut={handleClockOut}
     onOpenPayReport={() => setShowPayReportModal(true)}
   />
   ```
4. Add modal render (after `{showTimeEntryModal && <TimeEntryModal ... />}`):
   ```tsx
   {showPayReportModal && (
     <PayReportModal onClose={() => setShowPayReportModal(false)} />
   )}
   ```

**Step 5: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors

**Step 6: Commit**

```bash
git add src/components/TimeClockView.tsx src/app/page.tsx
git commit -m "feat: wire PayReportModal into TimeClockView and main page"
```

---

### Task 8: Admin view for submitted pay reports

**Files:**
- Modify: `src/components/AdminView.tsx`

**Step 1: Read current AdminView.tsx to understand its structure**

Read `src/components/AdminView.tsx` — identify:
- How sections/tabs are structured
- Where new content can be added
- What Supabase query patterns are used

**Step 2: Add a "Pay Submissions" section to AdminView**

Add a new section that:
1. Fetches `pay_report_submissions` joined with employee profiles:
   ```typescript
   supabase
     .from("pay_report_submissions")
     .select("*, employee:profiles!pay_report_submissions_employee_id_fkey(id, full_name)")
     .eq("company_id", profile.company_id)
     .order("submitted_at", { ascending: false })
   ```
2. Shows a list of submissions with:
   - Employee name
   - Period (start – end)
   - Total hours + gross pay
   - Status badge (`submitted` = yellow, `reviewed` = blue, `approved` = green)
   - Submitted date
   - "Mark Reviewed" and "Mark Approved" action buttons

3. Status update handler:
   ```typescript
   const handleUpdateStatus = async (id: string, status: "reviewed" | "approved") => {
     await supabase
       .from("pay_report_submissions")
       .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: user.id })
       .eq("id", id);
     // refresh list
   };
   ```

**Implementation structure in AdminView:**
- Add state: `paySubmissions`, `paySubsLoading`
- Add `useEffect` that loads submissions when the admin tab is active
- Add a "Pay Submissions" card/section below existing admin content with:
  - Section header with `FileText` icon and submission count badge
  - Empty state when no submissions
  - Submission list with action buttons

**Step 3: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "AdminView"
```
Expected: no errors

**Step 4: Commit**

```bash
git add src/components/AdminView.tsx
git commit -m "feat: add pay report submissions management to AdminView"
```

---

### Task 9: Final build verification

**Step 1: Run full TypeScript check**

```bash
npx tsc --noEmit 2>&1
```
Expected: no errors

**Step 2: Run build**

```bash
npm run build 2>&1 | tail -20
```
Expected: successful build, no errors

**Step 3: If build fails**

- Read error messages carefully
- Common @react-pdf/renderer issues: needs dynamic imports (already handled in Task 6)
- Common Next.js issues: "use client" boundaries for components using browser APIs

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve build issues for PDF pay report feature"
```

---

## Summary

| Task | What it builds | Key files |
|------|---------------|-----------|
| 1 | Install @react-pdf/renderer | package.json |
| 2 | TypeScript interfaces | src/lib/types.ts |
| 3 | Supabase migration | supabase/migrations/ |
| 4 | Pay report API + hour calc | src/app/api/pay/report/route.ts, src/lib/payCalculations.ts |
| 5 | PDF template | src/components/pay/PayReportPDF.tsx |
| 6 | Report modal UI | src/components/pay/PayReportModal.tsx |
| 7 | Wire into app | TimeClockView.tsx, page.tsx |
| 8 | Admin submissions view | AdminView.tsx |
| 9 | Build verification | — |
