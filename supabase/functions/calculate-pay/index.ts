// Edge Function: Calculate Pay
// Calculates pay breakdown for an employee for a specific pay period
// POST /calculate-pay
// Body: { employee_id: string, pay_period_id: string }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TimeEntry {
  id: string;
  user_id: string;
  job_name: string;
  clock_in: string;
  clock_out: string;
  hourly_rate: number;
}

interface ManualTimeEntry {
  id: string;
  employee_id: string;
  work_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  job_name: string | null;
  total_hours: number;
}

interface PayBreakdown {
  total_hours: number;
  regular_hours: number;
  overtime_hours: number;
  doubletime_hours: number;
  regular_pay: number;
  overtime_pay: number;
  doubletime_pay: number;
  gross_pay: number;
}

function calculateHoursBreakdown(entries: Array<{
  total_hours: number;
  clock_in?: string;
  clock_out?: string;
  work_date?: string;
}>): PayBreakdown {
  let totalHours = 0;
  let regularHours = 0;
  let overtimeHours = 0;
  let doubletimeHours = 0;

  // Group entries by date
  const entriesByDate = new Map<string, number>();
  
  for (const entry of entries) {
    const date = entry.work_date || new Date(entry.clock_in || Date.now()).toISOString().split('T')[0];
    const hours = entry.total_hours || 0;
    entriesByDate.set(date, (entriesByDate.get(date) || 0) + hours);
    totalHours += hours;
  }

  // Calculate breakdown per day (8 hours regular, rest overtime, weekends doubletime)
  for (const [date, hours] of entriesByDate.entries()) {
    const dayOfWeek = new Date(date).getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

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
    total_hours: totalHours,
    regular_hours: regularHours,
    overtime_hours: overtimeHours,
    doubletime_hours: doubletimeHours,
    regular_pay: 0,
    overtime_pay: 0,
    doubletime_pay: 0,
    gross_pay: 0,
  };
}

function calculatePay(breakdown: PayBreakdown, hourlyRate: number): PayBreakdown {
  const regularPay = breakdown.regular_hours * hourlyRate;
  const overtimePay = breakdown.overtime_hours * hourlyRate * 1.5;
  const doubletimePay = breakdown.doubletime_hours * hourlyRate * 2;
  const grossPay = regularPay + overtimePay + doubletimePay;

  return {
    ...breakdown,
    regular_pay: parseFloat(regularPay.toFixed(2)),
    overtime_pay: parseFloat(overtimePay.toFixed(2)),
    doubletime_pay: parseFloat(doubletimePay.toFixed(2)),
    gross_pay: parseFloat(grossPay.toFixed(2)),
  };
}

function calculateDeductions(grossPay: number): {
  federal_tax: number;
  state_tax: number;
  social_security: number;
  medicare: number;
  other_deductions: number;
  total_deductions: number;
  net_pay: number;
} {
  // Simplified tax calculations (in production, use proper tax tables)
  const federalTax = grossPay * 0.10; // 10% simplified federal
  const stateTax = grossPay * 0.05;   // 5% simplified state
  const socialSecurity = grossPay * 0.062; // 6.2%
  const medicare = grossPay * 0.0145;      // 1.45%
  const otherDeductions = 0;

  const totalDeductions = federalTax + stateTax + socialSecurity + medicare + otherDeductions;
  const netPay = grossPay - totalDeductions;

  return {
    federal_tax: parseFloat(federalTax.toFixed(2)),
    state_tax: parseFloat(stateTax.toFixed(2)),
    social_security: parseFloat(socialSecurity.toFixed(2)),
    medicare: parseFloat(medicare.toFixed(2)),
    other_deductions: parseFloat(otherDeductions.toFixed(2)),
    total_deductions: parseFloat(totalDeductions.toFixed(2)),
    net_pay: parseFloat(netPay.toFixed(2)),
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { employee_id, pay_period_id } = await req.json();

    if (!employee_id || !pay_period_id) {
      return new Response(
        JSON.stringify({ error: 'employee_id and pay_period_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get pay period details
    const { data: payPeriod, error: periodError } = await supabase
      .from('pay_periods')
      .select('*')
      .eq('id', pay_period_id)
      .single();

    if (periodError || !payPeriod) {
      return new Response(
        JSON.stringify({ error: 'Pay period not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get employee's hourly wage for the period
    const { data: wageData } = await supabase
      .rpc('get_current_hourly_wage', { 
        p_employee_id: employee_id, 
        p_date: payPeriod.period_end 
      });
    
    const hourlyRate = wageData || 0;

    // Get time entries for the employee within the pay period
    const { data: timeEntries, error: timeError } = await supabase
      .from('time_entries')
      .select('*')
      .eq('user_id', employee_id)
      .gte('clock_in', payPeriod.period_start)
      .lte('clock_in', payPeriod.period_end)
      .not('clock_out', 'is', null);

    if (timeError) {
      console.error('Error fetching time entries:', timeError);
    }

    // Get approved manual time entries for the employee within the pay period
    const { data: manualEntries, error: manualError } = await supabase
      .from('manual_time_entries')
      .select('*')
      .eq('employee_id', employee_id)
      .eq('status', 'approved')
      .gte('work_date', payPeriod.period_start)
      .lte('work_date', payPeriod.period_end);

    if (manualError) {
      console.error('Error fetching manual entries:', manualError);
    }

    // Process time entries
    const processedEntries: Array<{
      total_hours: number;
      clock_in: string;
      clock_out: string;
      work_date: string;
    }> = [];

    if (timeEntries) {
      for (const entry of timeEntries) {
        const clockIn = new Date(entry.clock_in);
        const clockOut = new Date(entry.clock_out);
        const totalHours = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);
        
        processedEntries.push({
          total_hours: parseFloat(totalHours.toFixed(2)),
          clock_in: entry.clock_in,
          clock_out: entry.clock_out,
          work_date: clockIn.toISOString().split('T')[0],
        });
      }
    }

    // Process manual time entries
    if (manualEntries) {
      for (const entry of manualEntries) {
        processedEntries.push({
          total_hours: parseFloat(entry.total_hours?.toString() || '0'),
          work_date: entry.work_date,
        });
      }
    }

    // Calculate hours breakdown
    const breakdown = calculateHoursBreakdown(processedEntries);
    
    // Calculate pay
    const payBreakdown = calculatePay(breakdown, hourlyRate);
    
    // Calculate deductions
    const deductions = calculateDeductions(payBreakdown.gross_pay);

    const result = {
      employee_id,
      pay_period_id,
      hourly_rate: hourlyRate,
      ...payBreakdown,
      ...deductions,
      time_entries_count: timeEntries?.length || 0,
      manual_entries_count: manualEntries?.length || 0,
      period: {
        start: payPeriod.period_start,
        end: payPeriod.period_end,
        pay_date: payPeriod.pay_date,
      },
    };

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error calculating pay:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
