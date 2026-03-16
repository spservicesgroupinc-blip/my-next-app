-- ============================================================
-- CONSOLIDATED SCHEMA FIX MIGRATION
-- Supabase Project: thwdaicnysqgjszcndkl
-- 
-- This migration fixes all schema mismatches identified in the
-- analysis and adds missing tables, columns, indexes, and RLS policies.
--
-- Run in Supabase Dashboard → SQL Editor:
-- https://thwdaicnysqgjszcndkl.supabase.co/dashboard/sql/editor
-- ============================================================

-- ============================================================
-- SECTION 1: CREATE MISSING pay_config TABLE
-- ============================================================
-- Stores company-specific payroll configuration settings

CREATE TABLE IF NOT EXISTS public.pay_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  
  -- Overtime thresholds
  daily_ot_threshold numeric NOT NULL DEFAULT 8,
  weekly_ot_threshold numeric NOT NULL DEFAULT 40,
  
  -- Pay multipliers
  ot_multiplier numeric NOT NULL DEFAULT 1.5,
  dt_multiplier numeric NOT NULL DEFAULT 2.0,
  
  -- Tax rates (percentage)
  federal_tax_rate numeric NOT NULL DEFAULT 10,
  state_tax_rate numeric NOT NULL DEFAULT 5,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure one config per company
  CONSTRAINT pay_config_company_id_unique UNIQUE (company_id),
  
  -- Validation constraints
  CONSTRAINT daily_ot_threshold_positive CHECK (daily_ot_threshold > 0),
  CONSTRAINT weekly_ot_threshold_positive CHECK (weekly_ot_threshold > 0),
  CONSTRAINT ot_multiplier_positive CHECK (ot_multiplier >= 1),
  CONSTRAINT dt_multiplier_positive CHECK (dt_multiplier >= 1),
  CONSTRAINT federal_tax_rate_valid CHECK (federal_tax_rate >= 0 AND federal_tax_rate <= 100),
  CONSTRAINT state_tax_rate_valid CHECK (state_tax_rate >= 0 AND state_tax_rate <= 100)
);

-- Index for pay_config
CREATE INDEX IF NOT EXISTS idx_pay_config_company_id ON public.pay_config(company_id);

-- Comment for pay_config table
COMMENT ON TABLE public.pay_config IS 'Company-specific payroll configuration including overtime thresholds and tax rates';
COMMENT ON COLUMN public.pay_config.company_id IS 'Reference to the company this config belongs to';
COMMENT ON COLUMN public.pay_config.daily_ot_threshold IS 'Hours per day before overtime applies (default: 8)';
COMMENT ON COLUMN public.pay_config.weekly_ot_threshold IS 'Hours per week before overtime applies (default: 40)';
COMMENT ON COLUMN public.pay_config.ot_multiplier IS 'Overtime pay multiplier (default: 1.5x)';
COMMENT ON COLUMN public.pay_config.dt_multiplier IS 'Doubletime pay multiplier (default: 2.0x)';
COMMENT ON COLUMN public.pay_config.federal_tax_rate IS 'Federal tax withholding rate as percentage (default: 10%)';
COMMENT ON COLUMN public.pay_config.state_tax_rate IS 'State tax withholding rate as percentage (default: 5%)';

-- Enable RLS for pay_config
ALTER TABLE public.pay_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies for pay_config
DROP POLICY IF EXISTS "pay_config_select_admins" ON public.pay_config;
CREATE POLICY "pay_config_select_admins" ON public.pay_config FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "pay_config_select_employees" ON public.pay_config;
CREATE POLICY "pay_config_select_employees" ON public.pay_config FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "pay_config_insert" ON public.pay_config;
CREATE POLICY "pay_config_insert" ON public.pay_config FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "pay_config_update" ON public.pay_config;
CREATE POLICY "pay_config_update" ON public.pay_config FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- SECTION 2: ADD notes COLUMN TO time_entries TABLE
-- ============================================================
-- Allows users to add notes to individual time entries

DO $$
BEGIN
  -- Add notes column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'time_entries' 
    AND column_name = 'notes'
  ) THEN
    ALTER TABLE public.time_entries ADD COLUMN notes text;
    COMMENT ON COLUMN public.time_entries.notes IS 'Optional notes or comments about this time entry';
  END IF;
END
$$;

-- ============================================================
-- SECTION 3: ADD EXTENDED COLUMNS TO companies TABLE
-- ============================================================
-- Adds additional company information fields if missing

DO $$
BEGIN
  -- Add address column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'companies' 
    AND column_name = 'address'
  ) THEN
    ALTER TABLE public.companies ADD COLUMN address text;
    COMMENT ON COLUMN public.companies.address IS 'Company physical/mailing address';
  END IF;

  -- Add phone column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'companies' 
    AND column_name = 'phone'
  ) THEN
    ALTER TABLE public.companies ADD COLUMN phone text;
    COMMENT ON COLUMN public.companies.phone IS 'Company phone number';
  END IF;

  -- Add email column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'companies' 
    AND column_name = 'email'
  ) THEN
    ALTER TABLE public.companies ADD COLUMN email text;
    COMMENT ON COLUMN public.companies.email IS 'Company contact email address';
  END IF;

  -- Add tax_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'companies' 
    AND column_name = 'tax_id'
  ) THEN
    ALTER TABLE public.companies ADD COLUMN tax_id text;
    COMMENT ON COLUMN public.companies.tax_id IS 'Company tax identification number (EIN/TIN)';
  END IF;
END
$$;

-- ============================================================
-- SECTION 4: CREATE MISSING INDEXES FOR PERFORMANCE
-- ============================================================
-- Indexes improve query performance for common access patterns

-- --- profiles table indexes ---
CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON public.profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON public.profiles(is_active);
CREATE INDEX IF NOT EXISTS idx_profiles_company_is_active ON public.profiles(company_id, is_active);

-- --- tasks table indexes ---
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_company_id ON public.tasks(company_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_company_status ON public.tasks(company_id, status);

-- --- time_entries table indexes ---
CREATE INDEX IF NOT EXISTS idx_time_entries_user_id ON public.time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_company_id ON public.time_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_clock_in ON public.time_entries(clock_in);

-- --- chat_messages table indexes ---
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON public.chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_company_id ON public.chat_messages(company_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.chat_messages(created_at);

-- --- jobs table indexes ---
CREATE INDEX IF NOT EXISTS idx_jobs_company_id ON public.jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_is_active ON public.jobs(is_active);

-- Add comments for indexes
COMMENT ON INDEX idx_profiles_company_id IS 'Fast lookup of profiles by company';
COMMENT ON INDEX idx_profiles_role IS 'Fast filtering by user role';
COMMENT ON INDEX idx_profiles_is_active IS 'Fast filtering of active users';
COMMENT ON INDEX idx_profiles_company_is_active IS 'Composite index for active users in a company';

COMMENT ON INDEX idx_tasks_assigned_to IS 'Fast lookup of tasks assigned to a user';
COMMENT ON INDEX idx_tasks_status IS 'Fast filtering by task status';
COMMENT ON INDEX idx_tasks_company_id IS 'Fast lookup of tasks by company';
COMMENT ON INDEX idx_tasks_due_date IS 'Fast sorting/filtering by due date';
COMMENT ON INDEX idx_tasks_company_status IS 'Composite index for tasks by company and status';

COMMENT ON INDEX idx_time_entries_user_id IS 'Fast lookup of time entries by user';
COMMENT ON INDEX idx_time_entries_company_id IS 'Fast lookup of time entries by company';
COMMENT ON INDEX idx_time_entries_clock_in IS 'Fast sorting/filtering by clock-in time';

COMMENT ON INDEX idx_chat_messages_sender_id IS 'Fast lookup of messages by sender';
COMMENT ON INDEX idx_chat_messages_company_id IS 'Fast lookup of messages by company';
COMMENT ON INDEX idx_chat_messages_created_at IS 'Fast sorting of messages by time';

COMMENT ON INDEX idx_jobs_company_id IS 'Fast lookup of jobs by company';
COMMENT ON INDEX idx_jobs_is_active IS 'Fast filtering of active jobs';

-- ============================================================
-- SECTION 5: ENSURE pay_report_submissions TABLE EXISTS
-- ============================================================
-- Tracks submitted pay reports for approval workflow
-- Note: This table may already exist from a previous migration

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
  created_at        timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT valid_period_dates CHECK (period_end >= period_start)
);

-- Indexes for pay_report_submissions (use IF NOT EXISTS via DO block)
DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS idx_pay_report_submissions_employee ON public.pay_report_submissions(employee_id);
  CREATE INDEX IF NOT EXISTS idx_pay_report_submissions_company ON public.pay_report_submissions(company_id);
  CREATE INDEX IF NOT EXISTS idx_pay_report_submissions_status ON public.pay_report_submissions(status);
  CREATE INDEX IF NOT EXISTS idx_pay_report_submissions_period ON public.pay_report_submissions(period_start, period_end);
END
$$;

-- Comment for pay_report_submissions
COMMENT ON TABLE public.pay_report_submissions IS 'Payroll report submissions for approval workflow';
COMMENT ON COLUMN public.pay_report_submissions.employee_id IS 'Employee who submitted the report';
COMMENT ON COLUMN public.pay_report_submissions.company_id IS 'Company this report belongs to';
COMMENT ON COLUMN public.pay_report_submissions.status IS 'Current approval status (submitted/reviewed/approved)';

-- Enable RLS for pay_report_submissions
ALTER TABLE public.pay_report_submissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for pay_report_submissions
-- Employees can see their own submissions
DROP POLICY IF EXISTS "employees_select_own_submissions" ON public.pay_report_submissions;
CREATE POLICY "employees_select_own_submissions" ON public.pay_report_submissions FOR SELECT
  USING (auth.uid() = employee_id);

-- Admins can see all submissions in their company
DROP POLICY IF EXISTS "admins_select_company_submissions" ON public.pay_report_submissions;
CREATE POLICY "admins_select_company_submissions" ON public.pay_report_submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
        AND company_id = pay_report_submissions.company_id
    )
  );

-- Employees can insert their own submissions
DROP POLICY IF EXISTS "employees_insert_own_submissions" ON public.pay_report_submissions;
CREATE POLICY "employees_insert_own_submissions" ON public.pay_report_submissions FOR INSERT
  WITH CHECK (auth.uid() = employee_id);

-- Admins can update status (reviewed/approved)
DROP POLICY IF EXISTS "admins_update_submissions" ON public.pay_report_submissions;
CREATE POLICY "admins_update_submissions" ON public.pay_report_submissions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
        AND company_id = pay_report_submissions.company_id
    )
  );

-- ============================================================
-- SECTION 6: ENSURE employee_locations TABLE EXISTS
-- ============================================================
-- Tracks employee GPS locations for live map tracking
-- Note: This table may already exist from a previous migration

CREATE TABLE IF NOT EXISTS public.employee_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy double precision,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

-- Indexes for employee_locations
DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS idx_employee_locations_user_id ON public.employee_locations(user_id);
  CREATE INDEX IF NOT EXISTS idx_employee_locations_updated_at ON public.employee_locations(updated_at);
END
$$;

-- Comment for employee_locations
COMMENT ON TABLE public.employee_locations IS 'Tracks employee GPS locations for live map tracking';
COMMENT ON COLUMN public.employee_locations.user_id IS 'Reference to the user (auth.users)';
COMMENT ON COLUMN public.employee_locations.latitude IS 'GPS latitude coordinate';
COMMENT ON COLUMN public.employee_locations.longitude IS 'GPS longitude coordinate';
COMMENT ON COLUMN public.employee_locations.accuracy IS 'GPS accuracy in meters';

-- Enable RLS for employee_locations
ALTER TABLE public.employee_locations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for employee_locations
-- Employees can upsert their own location
DROP POLICY IF EXISTS "Users can upsert own location" ON public.employee_locations;
CREATE POLICY "Users can upsert own location" ON public.employee_locations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own location" ON public.employee_locations;
CREATE POLICY "Users can update own location" ON public.employee_locations FOR UPDATE
  USING (auth.uid() = user_id);

-- Admins can read all locations
DROP POLICY IF EXISTS "Admins can read all locations" ON public.employee_locations;
CREATE POLICY "Admins can read all locations" ON public.employee_locations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Employees can read their own location
DROP POLICY IF EXISTS "Users can read own location" ON public.employee_locations;
CREATE POLICY "Users can read own location" ON public.employee_locations FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================
-- SECTION 7: TRIGGERS FOR updated_at TIMESTAMPS
-- ============================================================
-- Auto-updates the updated_at timestamp on tables that need it

-- Apply trigger to pay_config
DROP TRIGGER IF EXISTS trg_pay_config_updated_at ON public.pay_config;
CREATE TRIGGER trg_pay_config_updated_at
  BEFORE UPDATE ON public.pay_config
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Apply trigger to pay_report_submissions (if not already exists from pay-tracking-migration)
DROP TRIGGER IF EXISTS trg_pay_report_submissions_updated_at ON public.pay_report_submissions;
CREATE TRIGGER trg_pay_report_submissions_updated_at
  BEFORE UPDATE ON public.pay_report_submissions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- SECTION 8: ENABLE REALTIME FOR NEW TABLES
-- ============================================================
-- Enables real-time subscriptions for live data updates

-- Add new tables to realtime publication (ignore errors if already added)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pay_config;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pay_config already in publication or publication does not exist';
  END;
  
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pay_report_submissions;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pay_report_submissions already in publication or publication does not exist';
  END;
  
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_locations;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'employee_locations already in publication or publication does not exist';
  END;
END
$$;

-- ============================================================
-- SECTION 9: GRANT PERMISSIONS
-- ============================================================
-- Grants appropriate permissions to authenticated users

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- ============================================================
-- SECTION 10: VERIFICATION QUERIES
-- ============================================================
-- Run these queries to verify the migration was successful
-- Uncomment to run in Supabase SQL Editor

-- Verify pay_config table exists with correct columns
-- SELECT 
--   column_name, 
--   data_type, 
--   is_nullable,
--   column_default
-- FROM information_schema.columns 
-- WHERE table_schema = 'public' 
--   AND table_name = 'pay_config'
-- ORDER BY ordinal_position;

-- Verify time_entries has notes column
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns 
-- WHERE table_schema = 'public' 
--   AND table_name = 'time_entries'
--   AND column_name = 'notes';

-- Verify companies has extended columns
-- SELECT column_name, data_type
-- FROM information_schema.columns 
-- WHERE table_schema = 'public' 
--   AND table_name = 'companies'
--   AND column_name IN ('address', 'phone', 'email', 'tax_id')
-- ORDER BY column_name;

-- Verify all indexes exist
-- SELECT indexname, tablename
-- FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND indexname IN (
--     'idx_profiles_company_id',
--     'idx_profiles_role',
--     'idx_profiles_is_active',
--     'idx_profiles_company_is_active',
--     'idx_tasks_assigned_to',
--     'idx_tasks_status',
--     'idx_tasks_company_id',
--     'idx_tasks_due_date',
--     'idx_tasks_company_status',
--     'idx_time_entries_user_id',
--     'idx_time_entries_company_id',
--     'idx_time_entries_clock_in',
--     'idx_chat_messages_sender_id',
--     'idx_chat_messages_company_id',
--     'idx_chat_messages_created_at',
--     'idx_jobs_company_id',
--     'idx_jobs_is_active',
--     'idx_pay_config_company_id',
--     'idx_pay_report_submissions_company_id',
--     'idx_employee_locations_employee_id'
--   )
-- ORDER BY tablename, indexname;

-- Verify pay_report_submissions table structure
-- SELECT 
--   column_name, 
--   data_type, 
--   is_nullable
-- FROM information_schema.columns 
-- WHERE table_schema = 'public' 
--   AND table_name = 'pay_report_submissions'
-- ORDER BY ordinal_position;

-- Verify employee_locations table structure
-- SELECT 
--   column_name, 
--   data_type, 
--   is_nullable
-- FROM information_schema.columns 
-- WHERE table_schema = 'public' 
--   AND table_name = 'employee_locations'
-- ORDER BY ordinal_position;

-- Verify RLS is enabled on all tables
-- SELECT 
--   schemaname,
--   tablename,
--   rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN ('pay_config', 'pay_report_submissions', 'employee_locations')
-- ORDER BY tablename;

-- Verify RLS policies for pay_config
-- SELECT 
--   schemaname,
--   tablename,
--   policyname,
--   permissive,
--   roles,
--   cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename = 'pay_config'
-- ORDER BY policyname;

-- Quick summary query
-- SELECT 
--   'pay_config' as table_name, 
--   COUNT(*) as row_count 
-- FROM public.pay_config
-- UNION ALL
-- SELECT 
--   'pay_report_submissions', 
--   COUNT(*) 
-- FROM public.pay_report_submissions
-- UNION ALL
-- SELECT 
--   'employee_locations', 
--   COUNT(*) 
-- FROM public.employee_locations;

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
-- 
-- Summary of changes:
-- 1. ✅ Created pay_config table with company-specific payroll settings
-- 2. ✅ Added notes column to time_entries table
-- 3. ✅ Added address, phone, email, tax_id columns to companies table
-- 4. ✅ Created 20+ performance indexes across 5 tables
-- 5. ✅ Created pay_report_submissions table for approval workflow
-- 6. ✅ Created employee_locations table for job site tracking
-- 7. ✅ Added RLS policies for all new tables
-- 8. ✅ Added triggers for auto-updating updated_at timestamps
-- 9. ✅ Enabled realtime for new tables
-- 10. ✅ Granted permissions to authenticated users
--
-- Next steps:
-- - Run verification queries in Section 10 to confirm success
-- - Test RLS policies with different user roles
-- - Update application code to use new tables/columns
-- ============================================================
