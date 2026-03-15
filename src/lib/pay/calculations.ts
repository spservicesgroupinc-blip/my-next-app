/**
 * Pay Calculation Utilities
 * Core functions for calculating payroll, taxes, and time breakdowns
 */

export interface HoursBreakdown {
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  doubletimeHours: number;
}

export interface PayBreakdown extends HoursBreakdown {
  regularPay: number;
  overtimePay: number;
  doubletimePay: number;
  grossPay: number;
}

export interface DeductionsBreakdown {
  federalTax: number;
  stateTax: number;
  socialSecurity: number;
  medicare: number;
  otherDeductions: number;
  totalDeductions: number;
  netPay: number;
}

export interface FullPayCalculation extends PayBreakdown, DeductionsBreakdown {}

export interface TimeEntry {
  id: string;
  workDate: string;
  clockIn?: string;
  clockOut?: string;
  totalHours: number;
  jobName?: string;
}

/**
 * Tax rates (simplified - in production use proper tax tables)
 */
export const TAX_RATES = {
  FEDERAL: 0.10,      // 10% simplified federal
  STATE: 0.05,        // 5% simplified state
  SOCIAL_SECURITY: 0.062, // 6.2%
  MEDICARE: 0.0145,   // 1.45%
};

/**
 * Overtime multipliers
 */
export const OVERTIME_RATES = {
  REGULAR: 1.0,
  OVERTIME: 1.5,
  DOUBLETIME: 2.0,
};

/**
 * Calculate hours breakdown from time entries
 * Rules:
 * - Regular hours: First 8 hours per weekday
 * - Overtime hours: Hours over 8 per weekday
 * - Doubletime hours: All weekend hours (Saturday/Sunday)
 */
export function calculateHoursBreakdown(entries: TimeEntry[]): HoursBreakdown {
  let totalHours = 0;
  let regularHours = 0;
  let overtimeHours = 0;
  let doubletimeHours = 0;

  // Group entries by date
  const entriesByDate = new Map<string, number>();
  
  for (const entry of entries) {
    const hours = entry.totalHours || 0;
    const date = entry.workDate;
    
    entriesByDate.set(date, (entriesByDate.get(date) || 0) + hours);
    totalHours += hours;
  }

  // Calculate breakdown per day
  for (const [date, hours] of entriesByDate.entries()) {
    const dayOfWeek = new Date(date).getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday

    if (isWeekend) {
      // Weekend = all doubletime
      doubletimeHours += hours;
    } else {
      // Weekday: first 8 hours regular, rest overtime
      if (hours <= 8) {
        regularHours += hours;
      } else {
        regularHours += 8;
        overtimeHours += hours - 8;
      }
    }
  }

  return {
    totalHours: round(totalHours),
    regularHours: round(regularHours),
    overtimeHours: round(overtimeHours),
    doubletimeHours: round(doubletimeHours),
  };
}

/**
 * Calculate pay from hours breakdown and hourly rate
 */
export function calculatePayFromHours(
  breakdown: HoursBreakdown,
  hourlyRate: number
): PayBreakdown {
  const regularPay = breakdown.regularHours * hourlyRate * OVERTIME_RATES.REGULAR;
  const overtimePay = breakdown.overtimeHours * hourlyRate * OVERTIME_RATES.OVERTIME;
  const doubletimePay = breakdown.doubletimeHours * hourlyRate * OVERTIME_RATES.DOUBLETIME;
  const grossPay = regularPay + overtimePay + doubletimePay;

  return {
    ...breakdown,
    regularPay: round(regularPay),
    overtimePay: round(overtimePay),
    doubletimePay: round(doubletimePay),
    grossPay: round(grossPay),
  };
}

/**
 * Calculate deductions from gross pay
 */
export function calculateDeductions(grossPay: number): DeductionsBreakdown {
  const federalTax = grossPay * TAX_RATES.FEDERAL;
  const stateTax = grossPay * TAX_RATES.STATE;
  const socialSecurity = grossPay * TAX_RATES.SOCIAL_SECURITY;
  const medicare = grossPay * TAX_RATES.MEDICARE;
  const otherDeductions = 0;

  const totalDeductions = federalTax + stateTax + socialSecurity + medicare + otherDeductions;
  const netPay = grossPay - totalDeductions;

  return {
    federalTax: round(federalTax),
    stateTax: round(stateTax),
    socialSecurity: round(socialSecurity),
    medicare: round(medicare),
    otherDeductions: round(otherDeductions),
    totalDeductions: round(totalDeductions),
    netPay: round(netPay),
  };
}

/**
 * Full pay calculation from time entries and hourly rate
 */
export function calculateFullPay(
  entries: TimeEntry[],
  hourlyRate: number
): FullPayCalculation {
  const hoursBreakdown = calculateHoursBreakdown(entries);
  const payBreakdown = calculatePayFromHours(hoursBreakdown, hourlyRate);
  const deductionsBreakdown = calculateDeductions(payBreakdown.grossPay);

  return {
    ...payBreakdown,
    ...deductionsBreakdown,
  };
}

/**
 * Calculate hours between two timestamps
 */
export function calculateHoursBetween(clockIn: string, clockOut: string): number {
  const start = new Date(clockIn);
  const end = new Date(clockOut);
  const diffMs = end.getTime() - start.getTime();
  const hours = diffMs / (1000 * 60 * 60);
  return round(Math.max(0, hours));
}

/**
 * Calculate break-adjusted hours
 */
export function calculateAdjustedHours(
  startTime: string,
  endTime: string,
  breakMinutes: number
): number {
  const start = new Date(`2000-01-01T${startTime}`);
  const end = new Date(`2000-01-01T${endTime}`);
  
  let diffMs = end.getTime() - start.getTime();
  
  // Handle overnight shifts
  if (diffMs < 0) {
    diffMs += 24 * 60 * 60 * 1000;
  }
  
  const totalHours = diffMs / (1000 * 60 * 60);
  const breakHours = breakMinutes / 60;
  
  return round(Math.max(0, totalHours - breakHours));
}

/**
 * Format currency amount
 */
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Format hours for display
 */
export function formatHours(hours: number): string {
  return `${hours.toFixed(2)} hrs`;
}

/**
 * Round to 2 decimal places
 */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Validate pay period dates
 */
export function validatePayPeriodDates(
  periodStart: string,
  periodEnd: string,
  payDate: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  const pay = new Date(payDate);

  if (end < start) {
    errors.push('Period end date must be after period start date');
  }

  if (pay < end) {
    errors.push('Pay date must be on or after period end date');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get pay period type label
 */
export function getPayPeriodTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    weekly: 'Weekly',
    biweekly: 'Bi-Weekly',
    semimonthly: 'Semi-Monthly',
    monthly: 'Monthly',
  };
  return labels[type] || type;
}

/**
 * Get pay record status label
 */
export function getPayRecordStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: 'Draft',
    pending_approval: 'Pending Approval',
    approved: 'Approved',
    paid: 'Paid',
    void: 'Void',
  };
  return labels[status] || status;
}

/**
 * Get pay period status label
 */
export function getPayPeriodStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: 'Draft',
    active: 'Active',
    closed: 'Closed',
    archived: 'Archived',
  };
  return labels[status] || status;
}

/**
 * Get manual time entry status label
 */
export function getManualTimeStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
  };
  return labels[status] || status;
}

/**
 * Generate the next pay period dates based on period type
 */
export function getNextPayPeriodDates(
  currentEnd: Date,
  periodType: string
): { periodStart: string; periodEnd: string; payDate: string } {
  let nextStart: Date;
  let nextEnd: Date;
  let nextPayDate: Date;

  switch (periodType) {
    case 'weekly':
      nextStart = new Date(currentEnd);
      nextStart.setDate(nextStart.getDate() + 1);
      nextEnd = new Date(nextStart);
      nextEnd.setDate(nextEnd.getDate() + 6);
      nextPayDate = new Date(nextEnd);
      nextPayDate.setDate(nextPayDate.getDate() + 7);
      break;
    case 'semimonthly':
      const currentDay = currentEnd.getDate();
      if (currentDay <= 15) {
        nextStart = new Date(currentEnd.getFullYear(), currentEnd.getMonth(), 16);
        nextEnd = new Date(currentEnd.getFullYear(), currentEnd.getMonth() + 1, 0);
      } else {
        nextStart = new Date(currentEnd.getFullYear(), currentEnd.getMonth() + 1, 1);
        nextEnd = new Date(currentEnd.getFullYear(), currentEnd.getMonth() + 1, 15);
      }
      nextPayDate = new Date(nextEnd);
      nextPayDate.setDate(nextPayDate.getDate() + 7);
      break;
    case 'monthly':
      nextStart = new Date(currentEnd.getFullYear(), currentEnd.getMonth() + 1, 1);
      nextEnd = new Date(currentEnd.getFullYear(), currentEnd.getMonth() + 2, 0);
      nextPayDate = new Date(nextEnd);
      nextPayDate.setDate(nextPayDate.getDate() + 7);
      break;
    case 'biweekly':
    default:
      nextStart = new Date(currentEnd);
      nextStart.setDate(nextStart.getDate() + 1);
      nextEnd = new Date(nextStart);
      nextEnd.setDate(nextEnd.getDate() + 13);
      nextPayDate = new Date(nextEnd);
      nextPayDate.setDate(nextPayDate.getDate() + 7);
      break;
  }

  return {
    periodStart: nextStart.toISOString().split('T')[0],
    periodEnd: nextEnd.toISOString().split('T')[0],
    payDate: nextPayDate.toISOString().split('T')[0],
  };
}
