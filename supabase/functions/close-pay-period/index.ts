// Edge Function: Close Pay Period
// Closes a pay period and finalizes all pay records
// POST /close-pay-period
// Body: { pay_period_id: string }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { pay_period_id, user_id } = await req.json();

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

    if (payPeriod.status === 'closed' || payPeriod.status === 'archived') {
      return new Response(
        JSON.stringify({ error: `Pay period is already ${payPeriod.status}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all pay records for this period
    const { data: payRecords, error: recordsError } = await supabase
      .from('pay_records')
      .select('id, employee_id, status, net_pay')
      .eq('pay_period_id', pay_period_id);

    if (recordsError) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch pay records' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!payRecords || payRecords.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No pay records found for this period. Generate records first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if all records are approved
    const unapprovedRecords = payRecords.filter(r => r.status !== 'approved' && r.status !== 'paid');
    
    if (unapprovedRecords.length > 0) {
      return new Response(
        JSON.stringify({ 
          error: 'Cannot close period with unapproved records',
          unapproved_count: unapprovedRecords.length,
          unapproved_records: unapprovedRecords.map(r => ({
            id: r.id,
            employee_id: r.employee_id,
            status: r.status,
          })),
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate totals
    const totalGrossPay = payRecords.reduce((sum, r) => sum + (r.net_pay || 0), 0);

    // Update pay period status
    const { error: updatePeriodError } = await supabase
      .from('pay_periods')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        closed_by: user_id || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pay_period_id);

    if (updatePeriodError) {
      return new Response(
        JSON.stringify({ error: 'Failed to close pay period' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create the next pay period if this is the most recent one
    const { data: latestPeriod } = await supabase
      .from('pay_periods')
      .select('id, period_type, period_end')
      .eq('company_id', payPeriod.company_id)
      .order('period_end', { ascending: false })
      .limit(1)
      .single();

    if (latestPeriod?.id === pay_period_id) {
      // Calculate next period dates based on period type
      const currentEnd = new Date(payPeriod.period_end);
      let nextStart: Date;
      let nextEnd: Date;
      let nextPayDate: Date;

      switch (payPeriod.period_type) {
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

      await supabase
        .from('pay_periods')
        .insert({
          company_id: payPeriod.company_id,
          period_start: nextStart.toISOString().split('T')[0],
          period_end: nextEnd.toISOString().split('T')[0],
          period_type: payPeriod.period_type,
          status: 'draft',
          pay_date: nextPayDate.toISOString().split('T')[0],
          created_by: user_id || null,
        });
    }

    return new Response(
      JSON.stringify({
        success: true,
        pay_period_id,
        message: 'Pay period closed successfully',
        records_count: payRecords.length,
        total_net_pay: parseFloat(totalGrossPay.toFixed(2)),
        next_period_created: latestPeriod?.id === pay_period_id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error closing pay period:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
