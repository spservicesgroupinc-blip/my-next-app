/**
 * Supabase Client Utilities for Pay Operations
 * Functions for interacting with pay-related tables
 */

import { createClient } from '@supabase/supabase-js';

// Types
export interface Profile {
  id: string;
  full_name: string;
  role: 'admin' | 'employee';
  hourly_rate: number;
  is_active: boolean;
  company_id: string;
  created_at: string;
  updated_at: string;
}

export interface EmployeeHourlyWage {
  id: string;
  employee_id: string;
  hourly_rate: number;
  effective_date: string;
  end_date: string | null;
  currency: string;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

export interface PayPeriod {
  id: string;
  company_id: string;
  period_start: string;
  period_end: string;
  period_type: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
  status: 'draft' | 'active' | 'closed' | 'archived';
  pay_date: string;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  closed_at: string | null;
  closed_by: string | null;
  updated_at: string;
}

export interface PayRecord {
  id: string;
  employee_id: string;
  pay_period_id: string;
  company_id: string;
  hourly_rate_at_time: number;
  currency: string;
  regular_hours: number;
  overtime_hours: number;
  doubletime_hours: number;
  total_hours: number;
  regular_pay: number;
  overtime_pay: number;
  doubletime_pay: number;
  gross_pay: number;
  federal_tax: number;
  state_tax: number;
  social_security: number;
  medicare: number;
  other_deductions: number;
  total_deductions: number;
  net_pay: number;
  status: 'draft' | 'pending_approval' | 'approved' | 'paid' | 'void';
  invoice_number: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  approved_at: string | null;
  approved_by: string | null;
  paid_at: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface PayRecordTimeEntry {
  id: string;
  pay_record_id: string;
  time_entry_id: string | null;
  manual_time_entry_id: string | null;
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  job_name: string | null;
  total_hours: number;
  regular_hours: number;
  overtime_hours: number;
  doubletime_hours: number;
  hours_pay: number;
  notes: string | null;
  created_at: string;
}

export interface ManualTimeEntry {
  id: string;
  employee_id: string;
  company_id: string;
  work_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  total_hours: number;
  job_name: string | null;
  notes: string | null;
  status: 'pending' | 'approved' | 'rejected';
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentHistory {
  id: string;
  pay_record_id: string;
  payment_date: string;
  amount: number;
  payment_method: 'direct_deposit' | 'check' | 'cash' | 'wire_transfer' | 'other';
  reference_number: string | null;
  check_number: string | null;
  bank_account_last4: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

// Get Supabase client from environment
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }
  
  return createClient(supabaseUrl, supabaseAnonKey);
}

// ==================== Pay Periods ====================

export async function getPayPeriods(options?: {
  status?: string;
  companyId?: string;
  limit?: number;
}) {
  const supabase = getSupabaseClient();
  
  let query = supabase
    .from('pay_periods')
    .select('*, company:companies(name)')
    .order('period_end', { ascending: false });

  if (options?.status) {
    query = query.eq('status', options.status);
  }
  
  if (options?.companyId) {
    query = query.eq('company_id', options.companyId);
  }
  
  if (options?.limit) {
    query = query.limit(options.limit);
  }

  return query;
}

export async function getPayPeriod(id: string) {
  const supabase = getSupabaseClient();
  
  return supabase
    .from('pay_periods')
    .select('*, company:companies(*)')
    .eq('id', id)
    .single();
}

export async function createPayPeriod(data: {
  company_id: string;
  period_start: string;
  period_end: string;
  period_type: string;
  pay_date: string;
  notes?: string;
}) {
  const supabase = getSupabaseClient();
  
  return supabase
    .from('pay_periods')
    .insert(data)
    .select()
    .single();
}

export async function updatePayPeriod(id: string, data: Partial<PayPeriod>) {
  const supabase = getSupabaseClient();
  
  return supabase
    .from('pay_periods')
    .update(data)
    .eq('id', id)
    .select()
    .single();
}

export async function closePayPeriod(id: string, userId: string) {
  const supabase = getSupabaseClient();
  
  // Call edge function
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/close-pay-period`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ pay_period_id: id, user_id: userId }),
  });

  return response.json();
}

// ==================== Pay Records ====================

export async function getPayRecords(options?: {
  payPeriodId?: string;
  employeeId?: string;
  status?: string;
  companyId?: string;
}) {
  const supabase = getSupabaseClient();
  
  let query = supabase
    .from('pay_records')
    .select(`
      *,
      employee:profiles(full_name, email),
      pay_period:pay_periods(period_start, period_end, pay_date, status)
    `)
    .order('created_at', { ascending: false });

  if (options?.payPeriodId) {
    query = query.eq('pay_period_id', options.payPeriodId);
  }
  
  if (options?.employeeId) {
    query = query.eq('employee_id', options.employeeId);
  }
  
  if (options?.status) {
    query = query.eq('status', options.status);
  }
  
  if (options?.companyId) {
    query = query.eq('company_id', options.companyId);
  }

  return query;
}

export async function getPayRecord(id: string) {
  const supabase = getSupabaseClient();
  
  return supabase
    .from('pay_records')
    .select(`
      *,
      employee:profiles(full_name, email, hourly_rate),
      pay_period:pay_periods(*),
      time_entries:pay_record_time_entries(*)
    `)
    .eq('id', id)
    .single();
}

export async function updatePayRecord(id: string, data: Partial<PayRecord>) {
  const supabase = getSupabaseClient();
  
  return supabase
    .from('pay_records')
    .update(data)
    .eq('id', id)
    .select()
    .single();
}

export async function approvePayRecord(id: string, userId: string) {
  const supabase = getSupabaseClient();
  
  return supabase
    .from('pay_records')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: userId,
    })
    .eq('id', id)
    .select()
    .single();
}

export async function markPayRecordAsPaid(id: string) {
  const supabase = getSupabaseClient();
  
  return supabase
    .from('pay_records')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
}

export async function generatePayRecords(payPeriodId: string, dryRun = false) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-pay-records`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ pay_period_id: payPeriodId, dry_run: dryRun }),
  });

  return response.json();
}

// ==================== Employee Wages ====================

export async function getEmployeeWages(employeeId: string) {
  const supabase = getSupabaseClient();
  
  return supabase
    .from('employee_hourly_wages')
    .select('*')
    .eq('employee_id', employeeId)
    .order('effective_date', { ascending: false });
}

export async function getCurrentEmployeeWage(employeeId: string, date?: string) {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase.rpc('get_current_hourly_wage', {
    p_employee_id: employeeId,
    p_date: date || new Date().toISOString().split('T')[0],
  });

  return { data, error };
}

export async function setEmployeeWage(data: {
  employee_id: string;
  hourly_rate: number;
  effective_date: string;
  notes?: string;
}) {
  const supabase = getSupabaseClient();
  
  // End any existing active wage record
  await supabase
    .from('employee_hourly_wages')
    .update({ end_date: data.effective_date })
    .eq('employee_id', data.employee_id)
    .is('end_date', null);

  // Create new wage record
  return supabase
    .from('employee_hourly_wages')
    .insert(data)
    .select()
    .single();
}

// ==================== Manual Time Entries ====================

export async function getManualTimeEntries(options?: {
  employeeId?: string;
  status?: string;
  companyId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const supabase = getSupabaseClient();
  
  let query = supabase
    .from('manual_time_entries')
    .select(`
      *,
      employee:profiles(full_name)
    `)
    .order('work_date', { ascending: false });

  if (options?.employeeId) {
    query = query.eq('employee_id', options.employeeId);
  }
  
  if (options?.status) {
    query = query.eq('status', options.status);
  }
  
  if (options?.companyId) {
    query = query.eq('company_id', options.companyId);
  }
  
  if (options?.dateFrom) {
    query = query.gte('work_date', options.dateFrom);
  }
  
  if (options?.dateTo) {
    query = query.lte('work_date', options.dateTo);
  }

  return query;
}

export async function createManualTimeEntry(data: {
  employee_id: string;
  company_id: string;
  work_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  job_name?: string;
  notes?: string;
}) {
  const supabase = getSupabaseClient();
  
  return supabase
    .from('manual_time_entries')
    .insert(data)
    .select()
    .single();
}

export async function approveManualTimeEntry(id: string, userId: string) {
  const supabase = getSupabaseClient();
  
  return supabase
    .from('manual_time_entries')
    .update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: userId,
    })
    .eq('id', id)
    .select()
    .single();
}

export async function rejectManualTimeEntry(id: string, userId: string, reason: string) {
  const supabase = getSupabaseClient();
  
  return supabase
    .from('manual_time_entries')
    .update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: userId,
      rejection_reason: reason,
    })
    .eq('id', id)
    .select()
    .single();
}

// ==================== Payment History ====================

export async function getPaymentHistory(payRecordId: string) {
  const supabase = getSupabaseClient();
  
  return supabase
    .from('payment_history')
    .select('*')
    .eq('pay_record_id', payRecordId)
    .order('payment_date', { ascending: false });
}

export async function recordPayment(data: {
  pay_record_id: string;
  amount: number;
  payment_method: string;
  reference_number?: string;
  check_number?: string;
  notes?: string;
}) {
  const supabase = getSupabaseClient();
  
  return supabase
    .from('payment_history')
    .insert(data)
    .select()
    .single();
}

// ==================== Pay Record Time Entries ====================

export async function getPayRecordTimeEntries(payRecordId: string) {
  const supabase = getSupabaseClient();
  
  return supabase
    .from('pay_record_time_entries')
    .select(`
      *,
      time_entry:time_entries(*),
      manual_entry:manual_time_entries(*)
    `)
    .eq('pay_record_id', payRecordId)
    .order('work_date', { ascending: false });
}

// ==================== Dashboard Stats ====================

export async function getPayrollStats(companyId?: string) {
  const supabase = getSupabaseClient();
  
  // Get current period stats
  const { data: currentPeriod } = await supabase
    .from('pay_periods')
    .select('id, period_start, period_end, status')
    .eq('status', 'active')
    .order('period_end', { ascending: false })
    .limit(1)
    .single();

  // Get pending manual time entries count
  const { count: pendingManualTimeCount } = await supabase
    .from('manual_time_entries')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');

  // Get draft pay records count
  const { count: draftPayRecordsCount } = await supabase
    .from('pay_records')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'draft');

  return {
    currentPeriod,
    pendingManualTimeCount: pendingManualTimeCount || 0,
    draftPayRecordsCount: draftPayRecordsCount || 0,
  };
}
