-- ============================================================
-- Employee Pay Tracking System - Complete Database Migration
-- Run this in Supabase Dashboard → SQL Editor at:
-- https://thwdaicnysqgjszcndkl.supabase.co/dashboard/sql/editor
-- ============================================================

-- ============================================================
-- PART 1: Ensure companies table exists
-- ============================================================

CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  phone text,
  email text,
  tax_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Insert default company if none exists
INSERT INTO public.companies (id, name)
SELECT '00000000-0000-0000-0000-000000000001', 'Default Company'
WHERE NOT EXISTS (SELECT 1 FROM public.companies);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "companies_select" ON public.companies;
CREATE POLICY "companies_select" ON public.companies FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "companies_update" ON public.companies;
CREATE POLICY "companies_update" ON public.companies FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- PART 2: Employee Hourly Wages Table
-- Tracks wage history for each employee over time
-- ============================================================

CREATE TABLE IF NOT EXISTS public.employee_hourly_wages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  hourly_rate NUMERIC(10,2) NOT NULL CHECK (hourly_rate >= 0),
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  currency text NOT NULL DEFAULT 'USD',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT valid_date_range CHECK (end_date IS NULL OR end_date >= effective_date)
);

-- Indexes for employee_hourly_wages
CREATE INDEX IF NOT EXISTS idx_employee_wages_employee_id ON public.employee_hourly_wages(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_wages_effective_date ON public.employee_hourly_wages(effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_employee_wages_active ON public.employee_hourly_wages(employee_id, end_date) WHERE end_date IS NULL;

ALTER TABLE public.employee_hourly_wages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for employee_hourly_wages
DROP POLICY IF EXISTS "employee_wages_select" ON public.employee_hourly_wages;
CREATE POLICY "employee_wages_select" ON public.employee_hourly_wages FOR SELECT
  USING (
    employee_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "employee_wages_insert" ON public.employee_hourly_wages;
CREATE POLICY "employee_wages_insert" ON public.employee_hourly_wages FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "employee_wages_update" ON public.employee_hourly_wages;
CREATE POLICY "employee_wages_update" ON public.employee_hourly_wages FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- PART 3: Pay Periods Table
-- Defines pay period schedules (weekly, bi-weekly, semi-monthly, monthly)
-- ============================================================

CREATE TYPE pay_period_type AS ENUM ('weekly', 'biweekly', 'semimonthly', 'monthly');
CREATE TYPE pay_period_status AS ENUM ('draft', 'active', 'closed', 'archived');

CREATE TABLE IF NOT EXISTS public.pay_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  period_type pay_period_type NOT NULL DEFAULT 'biweekly',
  status pay_period_status NOT NULL DEFAULT 'draft',
  pay_date date NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  closed_at timestamptz,
  closed_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT valid_period_dates CHECK (period_end >= period_start),
  CONSTRAINT valid_pay_date CHECK (pay_date >= period_end)
);

-- Indexes for pay_periods
CREATE INDEX IF NOT EXISTS idx_pay_periods_company_id ON public.pay_periods(company_id);
CREATE INDEX IF NOT EXISTS idx_pay_periods_status ON public.pay_periods(status);
CREATE INDEX IF NOT EXISTS idx_pay_periods_dates ON public.pay_periods(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_pay_periods_pay_date ON public.pay_periods(pay_date);

ALTER TABLE public.pay_periods ENABLE ROW LEVEL SECURITY;

-- RLS Policies for pay_periods
DROP POLICY IF EXISTS "pay_periods_select" ON public.pay_periods;
CREATE POLICY "pay_periods_select" ON public.pay_periods FOR SELECT
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "pay_periods_insert" ON public.pay_periods;
CREATE POLICY "pay_periods_insert" ON public.pay_periods FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "pay_periods_update" ON public.pay_periods;
CREATE POLICY "pay_periods_update" ON public.pay_periods FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "pay_periods_delete" ON public.pay_periods;
CREATE POLICY "pay_periods_delete" ON public.pay_periods FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    AND status = 'draft'
  );

-- ============================================================
-- PART 4: Pay Records Table
-- Main payroll record for each employee per pay period
-- ============================================================

CREATE TYPE pay_record_status AS ENUM ('draft', 'pending_approval', 'approved', 'paid', 'void');

CREATE TABLE IF NOT EXISTS public.pay_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pay_period_id uuid NOT NULL REFERENCES public.pay_periods(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  
  -- Rate information
  hourly_rate_at_time NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  
  -- Hours breakdown
  regular_hours NUMERIC(8,2) NOT NULL DEFAULT 0,
  overtime_hours NUMERIC(8,2) NOT NULL DEFAULT 0,
  doubletime_hours NUMERIC(8,2) NOT NULL DEFAULT 0,
  total_hours NUMERIC(8,2) GENERATED ALWAYS AS (regular_hours + overtime_hours + doubletime_hours) STORED,
  
  -- Pay breakdown
  regular_pay NUMERIC(10,2) NOT NULL DEFAULT 0,
  overtime_pay NUMERIC(10,2) NOT NULL DEFAULT 0,
  doubletime_pay NUMERIC(10,2) NOT NULL DEFAULT 0,
  gross_pay NUMERIC(10,2) NOT NULL DEFAULT 0,
  
  -- Deductions
  federal_tax NUMERIC(10,2) NOT NULL DEFAULT 0,
  state_tax NUMERIC(10,2) NOT NULL DEFAULT 0,
  social_security NUMERIC(10,2) NOT NULL DEFAULT 0,
  medicare NUMERIC(10,2) NOT NULL DEFAULT 0,
  other_deductions NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_deductions NUMERIC(10,2) NOT NULL DEFAULT 0,
  
  -- Final pay
  net_pay NUMERIC(10,2) NOT NULL DEFAULT 0,
  
  -- Status and metadata
  status pay_record_status NOT NULL DEFAULT 'draft',
  invoice_number text UNIQUE,
  notes text,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  approved_by uuid REFERENCES public.profiles(id),
  paid_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id)
);

-- Indexes for pay_records
CREATE INDEX IF NOT EXISTS idx_pay_records_employee_id ON public.pay_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_pay_records_pay_period_id ON public.pay_records(pay_period_id);
CREATE INDEX IF NOT EXISTS idx_pay_records_company_id ON public.pay_records(company_id);
CREATE INDEX IF NOT EXISTS idx_pay_records_status ON public.pay_records(status);
CREATE INDEX IF NOT EXISTS idx_pay_records_invoice_number ON public.pay_records(invoice_number);
CREATE INDEX IF NOT EXISTS idx_pay_records_created_at ON public.pay_records(created_at DESC);

ALTER TABLE public.pay_records ENABLE ROW LEVEL SECURITY;

-- RLS Policies for pay_records
DROP POLICY IF EXISTS "pay_records_select" ON public.pay_records;
CREATE POLICY "pay_records_select" ON public.pay_records FOR SELECT
  USING (
    employee_id = auth.uid()
    OR company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "pay_records_insert" ON public.pay_records;
CREATE POLICY "pay_records_insert" ON public.pay_records FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "pay_records_update" ON public.pay_records;
CREATE POLICY "pay_records_update" ON public.pay_records FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- PART 5: Pay Record Time Entries (Junction Table)
-- Links time entries to pay records with breakdown
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pay_record_time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pay_record_id uuid NOT NULL REFERENCES public.pay_records(id) ON DELETE CASCADE,
  time_entry_id uuid REFERENCES public.time_entries(id) ON DELETE SET NULL,
  manual_time_entry_id uuid REFERENCES public.manual_time_entries(id) ON DELETE SET NULL,
  
  -- Work details
  work_date date NOT NULL,
  clock_in timestamptz,
  clock_out timestamptz,
  job_name text,
  
  -- Hours breakdown
  total_hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  regular_hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  overtime_hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  doubletime_hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  
  -- Pay calculation for this entry
  hours_pay NUMERIC(8,2) NOT NULL DEFAULT 0,
  
  -- Metadata
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT has_time_source CHECK (time_entry_id IS NOT NULL OR manual_time_entry_id IS NOT NULL)
);

-- Indexes for pay_record_time_entries
CREATE INDEX IF NOT EXISTS idx_prte_pay_record_id ON public.pay_record_time_entries(pay_record_id);
CREATE INDEX IF NOT EXISTS idx_prte_time_entry_id ON public.pay_record_time_entries(time_entry_id);
CREATE INDEX IF NOT EXISTS idx_prte_manual_time_entry_id ON public.pay_record_time_entries(manual_time_entry_id);
CREATE INDEX IF NOT EXISTS idx_prte_work_date ON public.pay_record_time_entries(work_date);

ALTER TABLE public.pay_record_time_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for pay_record_time_entries
DROP POLICY IF EXISTS "prte_select" ON public.pay_record_time_entries;
CREATE POLICY "prte_select" ON public.pay_record_time_entries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pay_records pr
      JOIN public.profiles p ON p.company_id = pr.company_id
      WHERE pr.id = pay_record_id AND p.id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "prte_insert" ON public.pay_record_time_entries;
CREATE POLICY "prte_insert" ON public.pay_record_time_entries FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "prte_update" ON public.pay_record_time_entries;
CREATE POLICY "prte_update" ON public.pay_record_time_entries FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- PART 6: Manual Time Entries Table
-- For manually entered time not captured by time clock
-- ============================================================

CREATE TYPE manual_time_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE IF NOT EXISTS public.manual_time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  
  -- Time details
  work_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  break_minutes INTEGER NOT NULL DEFAULT 0,
  
  -- Calculated hours
  total_hours NUMERIC(6,2) GENERATED ALWAYS AS (
    GREATEST(0, (EXTRACT(EPOCH FROM (end_time - start_time)) / 3600) - (break_minutes / 60.0))
  ) STORED,
  
  -- Additional info
  job_name text,
  notes text,
  
  -- Approval workflow
  status manual_time_status NOT NULL DEFAULT 'pending',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id),
  rejection_reason text,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for manual_time_entries
CREATE INDEX IF NOT EXISTS idx_manual_time_employee_id ON public.manual_time_entries(employee_id);
CREATE INDEX IF NOT EXISTS idx_manual_time_company_id ON public.manual_time_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_manual_time_status ON public.manual_time_entries(status);
CREATE INDEX IF NOT EXISTS idx_manual_time_work_date ON public.manual_time_entries(work_date DESC);
CREATE INDEX IF NOT EXISTS idx_manual_time_pending ON public.manual_time_entries(employee_id, status) WHERE status = 'pending';

ALTER TABLE public.manual_time_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for manual_time_entries
DROP POLICY IF EXISTS "manual_time_select" ON public.manual_time_entries;
CREATE POLICY "manual_time_select" ON public.manual_time_entries FOR SELECT
  USING (
    employee_id = auth.uid()
    OR company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "manual_time_insert" ON public.manual_time_entries;
CREATE POLICY "manual_time_insert" ON public.manual_time_entries FOR INSERT
  WITH CHECK (
    employee_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "manual_time_update_employee" ON public.manual_time_entries;
CREATE POLICY "manual_time_update_employee" ON public.manual_time_entries FOR UPDATE
  USING (
    employee_id = auth.uid()
    AND status = 'pending'
  );

DROP POLICY IF EXISTS "manual_time_update_admin" ON public.manual_time_entries;
CREATE POLICY "manual_time_update_admin" ON public.manual_time_entries FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- PART 7: Payment History Table
-- Tracks actual payments made for pay records
-- ============================================================

CREATE TYPE payment_method AS ENUM ('direct_deposit', 'check', 'cash', 'wire_transfer', 'other');

CREATE TABLE IF NOT EXISTS public.payment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pay_record_id uuid NOT NULL REFERENCES public.pay_records(id) ON DELETE CASCADE,
  
  -- Payment details
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  payment_method payment_method NOT NULL DEFAULT 'direct_deposit',
  reference_number text,
  check_number text,
  bank_account_last4 text,
  
  -- Additional info
  notes text,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);

-- Indexes for payment_history
CREATE INDEX IF NOT EXISTS idx_payment_history_pay_record_id ON public.payment_history(pay_record_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_payment_date ON public.payment_history(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payment_history_reference ON public.payment_history(reference_number);

ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for payment_history
DROP POLICY IF EXISTS "payment_history_select" ON public.payment_history;
CREATE POLICY "payment_history_select" ON public.payment_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pay_records pr
      JOIN public.profiles p ON p.company_id = pr.company_id
      WHERE pr.id = pay_record_id AND p.id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "payment_history_insert" ON public.payment_history;
CREATE POLICY "payment_history_insert" ON public.payment_history FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- PART 8: Trigger Functions for Auto-updating
-- ============================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Apply updated_at trigger to all relevant tables
DROP TRIGGER IF EXISTS trg_employee_wages_updated_at ON public.employee_hourly_wages;
CREATE TRIGGER trg_employee_wages_updated_at
  BEFORE UPDATE ON public.employee_hourly_wages
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_pay_periods_updated_at ON public.pay_periods;
CREATE TRIGGER trg_pay_periods_updated_at
  BEFORE UPDATE ON public.pay_periods
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_pay_records_updated_at ON public.pay_records;
CREATE TRIGGER trg_pay_records_updated_at
  BEFORE UPDATE ON public.pay_records
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_manual_time_updated_at ON public.manual_time_entries;
CREATE TRIGGER trg_manual_time_updated_at
  BEFORE UPDATE ON public.manual_time_entries
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- PART 9: Function to Get Current Employee Wage
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_current_hourly_wage(p_employee_id uuid, p_date date DEFAULT CURRENT_DATE)
RETURNS NUMERIC(10,2) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_wage NUMERIC(10,2);
BEGIN
  SELECT hourly_rate INTO v_wage
  FROM public.employee_hourly_wages
  WHERE employee_id = p_employee_id
    AND effective_date <= p_date
    AND (end_date IS NULL OR end_date >= p_date)
  ORDER BY effective_date DESC
  LIMIT 1;
  
  -- Fallback to profile hourly_rate if no wage history
  IF v_wage IS NULL THEN
    SELECT hourly_rate INTO v_wage
    FROM public.profiles
    WHERE id = p_employee_id;
  END IF;
  
  RETURN COALESCE(v_wage, 0);
END;
$$;

-- ============================================================
-- PART 10: Function to Calculate Pay for Time Entry
-- ============================================================

CREATE OR REPLACE FUNCTION public.calculate_time_entry_pay(
  p_clock_in timestamptz,
  p_clock_out timestamptz,
  p_hourly_rate NUMERIC
)
RETURNS TABLE (
  total_hours NUMERIC,
  regular_hours NUMERIC,
  overtime_hours NUMERIC,
  doubletime_hours NUMERIC,
  total_pay NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_total_seconds NUMERIC;
  v_total_hours NUMERIC;
  v_regular_hours NUMERIC := 0;
  v_overtime_hours NUMERIC := 0;
  v_doubletime_hours NUMERIC := 0;
  v_day_of_week INTEGER;
  v_start_hour INTEGER;
  v_end_hour INTEGER;
  v_night_hours NUMERIC := 0;
BEGIN
  -- Calculate total hours
  v_total_seconds := EXTRACT(EPOCH FROM (p_clock_out - p_clock_in));
  v_total_hours := v_total_seconds / 3600;
  
  -- Get day of week (0 = Sunday, 6 = Saturday)
  v_day_of_week := EXTRACT(DOW FROM p_clock_in);
  
  -- Get start and end hours
  v_start_hour := EXTRACT(HOUR FROM p_clock_in);
  v_end_hour := EXTRACT(HOUR FROM p_clock_out);
  
  -- Calculate overtime (hours over 8 in a day)
  IF v_total_hours > 8 THEN
    v_regular_hours := 8;
    v_overtime_hours := v_total_hours - 8;
  ELSE
    v_regular_hours := v_total_hours;
  END IF;
  
  -- Weekend doubletime (Saturday/Sunday)
  IF v_day_of_week = 0 OR v_day_of_week = 6 THEN
    v_doubletime_hours := v_total_hours;
    v_regular_hours := 0;
    v_overtime_hours := 0;
  END IF;
  
  -- Calculate pay
  total_pay := (v_regular_hours * p_hourly_rate) 
             + (v_overtime_hours * p_hourly_rate * 1.5) 
             + (v_doubletime_hours * p_hourly_rate * 2);
  
  total_hours := v_total_hours;
  regular_hours := v_regular_hours;
  overtime_hours := v_overtime_hours;
  doubletime_hours := v_doubletime_hours;
  
  RETURN NEXT;
END;
$$;

-- ============================================================
-- PART 11: Function to Generate Invoice Number
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_invoice_number(p_pay_record_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_invoice_number text;
  v_year integer;
  v_sequence integer;
BEGIN
  SELECT EXTRACT(YEAR FROM created_at) INTO v_year
  FROM public.pay_records WHERE id = p_pay_record_id;
  
  SELECT COUNT(*) + 1 INTO v_sequence
  FROM public.pay_records
  WHERE EXTRACT(YEAR FROM created_at) = v_year;
  
  v_invoice_number := FORMAT('INV-%s-%06d', v_year, v_sequence);
  
  UPDATE public.pay_records
  SET invoice_number = v_invoice_number
  WHERE id = p_pay_record_id;
  
  RETURN v_invoice_number;
END;
$$;

-- ============================================================
-- PART 12: Enable Realtime for Pay Tables
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_hourly_wages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pay_periods;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pay_records;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pay_record_time_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.manual_time_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_history;

-- ============================================================
-- PART 13: Create Default Pay Period (Current Bi-weekly)
-- ============================================================

-- Insert a default pay period if none exists
DO $$
DECLARE
  v_company_id uuid;
  v_period_start date;
  v_period_end date;
  v_pay_date date;
BEGIN
  SELECT id INTO v_company_id FROM public.companies LIMIT 1;
  
  IF v_company_id IS NOT NULL THEN
    -- Calculate current bi-weekly period (starting from most recent Monday)
    v_period_start := CURRENT_DATE - ((EXTRACT(DOW FROM CURRENT_DATE) + 6) % 14)::integer;
    v_period_end := v_period_start + 13;
    v_pay_date := v_period_end + 7;
    
    INSERT INTO public.pay_periods (company_id, period_start, period_end, period_type, status, pay_date)
    SELECT v_company_id, v_period_start, v_period_end, 'biweekly', 'draft', v_pay_date
    WHERE NOT EXISTS (SELECT 1 FROM public.pay_periods WHERE status = 'draft');
  END IF;
END $$;

-- ============================================================
-- PART 14: Grant Permissions to Authenticated Users
-- ============================================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
