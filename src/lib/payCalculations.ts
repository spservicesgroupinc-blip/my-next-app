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
