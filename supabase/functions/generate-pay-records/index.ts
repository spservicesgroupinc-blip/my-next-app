// Edge Function: Generate Pay Records
// Generates pay records for all employees in a pay period
// POST /generate-pay-records
// Body: { pay_period_id: string }

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

function calculateHoursBreakdown(entries: Array<{
  total_hours: number;
  clock_in?: string;
  clock_out?: string;
  work_date?: string;
}>): {
  total_hours: number;
  regular_hours: number;
  overtime_hours: number;
  doubletime_hours: number;
} {
  let totalHours = 0;
  let regularHours = 0;
  let overtimeHours = 0;
  let doubletimeHours = 0;

  const entriesByDate = new Map<string, number>();
  
  for (const entry of entries) {
    const date = entry.work_date || new Date(entry.clock_in || Date.now()).toISOString().split('T')[0];
    const hours = entry.total_hours || 0;
    entriesByDate.set(date, (entriesByDate.get(date) || 0) + hours);
    totalHours += hours;
  }

  for (const [date, hours] of entriesByDate.entries()) {
    const dayOfWeek = new Date(date).getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (isWeekend) {
      doubletimeHours += hours;
    } else {
      if (hours <= 8) {
        regularHours += hours;
      } else {
        regularHours += 8;
        overtimeHours += hours - 8;
      }
    }
  }

  return {
    total_hours: parseFloat(totalHours.toFixed(2)),
    regular_hours: parseFloat(regularHours.toFixed(2)),
    overtime_hours: parseFloat(overtimeHours.toFixed(2)),
    doubletime_hours: parseFloat(doubletimeHours.toFixed(2)),
  };
}

function calculatePay(
  regularHours: number,
  overtimeHours: number,
  doubletimeHours: number,
  hourlyRate: number
): {
  regular_pay: number;
  overtime_pay: number;
  doubletime_pay: number;
  gross_pay: number;
} {
  const regularPay = regularHours * hourlyRate;
  const overtimePay = overtimeHours * hourlyRate * 1.5;
  const doubletimePay = doubletimeHours * hourlyRate * 2;
  const grossPay = regularPay + overtimePay + doubletimePay;

  return {
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
  const federalTax = grossPay * 0.10;
  const stateTax = grossPay * 0.05;
  const socialSecurity = grossPay * 0.062;
  const medicare = grossPay * 0.0145;
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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { pay_period_id, dry_run } = await req.json();

    if (!pay_period_id) {
      return new Response(
        JSON.stringify({ error: 'pay_period_id is required' }),
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

    if (payPeriod.status === 'closed') {
      return new Response(
        JSON.stringify({ error: 'Cannot generate records for a closed pay period' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all active employees in the company
    const { data: employees, error: employeesError } = await supabase
      .from('profiles')
      .select('id, full_name, hourly_rate, company_id')
      .eq('company_id', payPeriod.company_id)
      .eq('is_active', true);

    if (employeesError) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch employees' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const generatedRecords = [];
    const errors = [];

    for (const employee of employees || []) {
      try {
        // Get hourly wage for this employee
        const { data: wageData } = await supabase
          .rpc('get_current_hourly_wage', { 
            p_employee_id: employee.id, 
            p_date: payPeriod.period_end 
          });
        
        const hourlyRate = wageData || employee.hourly_rate || 0;

        // Get time entries for this employee in the period
        const { data: timeEntries } = await supabase
          .from('time_entries')
          .select('*')
          .eq('user_id', employee.id)
          .gte('clock_in', payPeriod.period_start)
          .lte('clock_in', payPeriod.period_end)
          .not('clock_out', 'is', null);

        // Get approved manual time entries
        const { data: manualEntries } = await supabase
          .from('manual_time_entries')
          .select('*')
          .eq('employee_id', employee.id)
          .eq('status', 'approved')
          .gte('work_date', payPeriod.period_start)
          .lte('work_date', payPeriod.period_end);

        // Process entries
        const processedEntries: Array<{
          total_hours: number;
          work_date: string;
        }> = [];

        if (timeEntries) {
          for (const entry of timeEntries) {
            const clockIn = new Date(entry.clock_in);
            const clockOut = new Date(entry.clock_out);
            const totalHours = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);
            
            processedEntries.push({
              total_hours: parseFloat(totalHours.toFixed(2)),
              work_date: clockIn.toISOString().split('T')[0],
            });
          }
        }

        if (manualEntries) {
          for (const entry of manualEntries) {
            processedEntries.push({
              total_hours: parseFloat(entry.total_hours?.toString() || '0'),
              work_date: entry.work_date,
            });
          }
        }

        // Skip employees with no time entries
        if (processedEntries.length === 0) {
          continue;
        }

        // Calculate hours and pay
        const breakdown = calculateHoursBreakdown(processedEntries);
        const pay = calculatePay(
          breakdown.regular_hours,
          breakdown.overtime_hours,
          breakdown.doubletime_hours,
          hourlyRate
        );
        const deductions = calculateDeductions(pay.gross_pay);

        if (dry_run) {
          generatedRecords.push({
            employee_id: employee.id,
            employee_name: employee.full_name,
            hourly_rate: hourlyRate,
            ...breakdown,
            ...pay,
            ...deductions,
            time_entries_count: timeEntries?.length || 0,
            manual_entries_count: manualEntries?.length || 0,
          });
          continue;
        }

        // Check if pay record already exists
        const { data: existingRecord } = await supabase
          .from('pay_records')
          .select('id')
          .eq('employee_id', employee.id)
          .eq('pay_period_id', pay_period_id)
          .single();

        if (existingRecord) {
          // Update existing record
          const { error: updateError } = await supabase
            .from('pay_records')
            .update({
              hourly_rate_at_time: hourlyRate,
              regular_hours: breakdown.regular_hours,
              overtime_hours: breakdown.overtime_hours,
              doubletime_hours: breakdown.doubletime_hours,
              regular_pay: pay.regular_pay,
              overtime_pay: pay.overtime_pay,
              doubletime_pay: pay.doubletime_pay,
              gross_pay: pay.gross_pay,
              federal_tax: deductions.federal_tax,
              state_tax: deductions.state_tax,
              social_security: deductions.social_security,
              medicare: deductions.medicare,
              other_deductions: deductions.other_deductions,
              total_deductions: deductions.total_deductions,
              net_pay: deductions.net_pay,
              status: 'draft',
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingRecord.id);

          if (updateError) {
            errors.push({ employee_id: employee.id, error: updateError.message });
            continue;
          }

          generatedRecords.push({
            id: existingRecord.id,
            employee_id: employee.id,
            employee_name: employee.full_name,
            action: 'updated',
          });
        } else {
          // Create new record
          const { data: newRecord, error: createError } = await supabase
            .from('pay_records')
            .insert({
              employee_id: employee.id,
              pay_period_id: pay_period_id,
              company_id: payPeriod.company_id,
              hourly_rate_at_time: hourlyRate,
              regular_hours: breakdown.regular_hours,
              overtime_hours: breakdown.overtime_hours,
              doubletime_hours: breakdown.doubletime_hours,
              regular_pay: pay.regular_pay,
              overtime_pay: pay.overtime_pay,
              doubletime_pay: pay.doubletime_pay,
              gross_pay: pay.gross_pay,
              federal_tax: deductions.federal_tax,
              state_tax: deductions.state_tax,
              social_security: deductions.social_security,
              medicare: deductions.medicare,
              other_deductions: deductions.other_deductions,
              total_deductions: deductions.total_deductions,
              net_pay: deductions.net_pay,
              status: 'draft',
            })
            .select()
            .single();

          if (createError) {
            errors.push({ employee_id: employee.id, error: createError.message });
            continue;
          }

          // Generate invoice number
          await supabase.rpc('generate_invoice_number', { p_pay_record_id: newRecord.id });

          generatedRecords.push({
            id: newRecord.id,
            employee_id: employee.id,
            employee_name: employee.full_name,
            invoice_number: newRecord.invoice_number,
            action: 'created',
          });
        }
      } catch (error) {
        errors.push({ employee_id: employee.id, error: error.message });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        pay_period_id,
        records_generated: generatedRecords.length,
        records: generatedRecords,
        errors: errors.length > 0 ? errors : undefined,
        dry_run: dry_run || false,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error generating pay records:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
