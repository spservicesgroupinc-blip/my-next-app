-- ============================================================================
-- ProTask Complete Database Schema Migration
-- Run this in Supabase SQL Editor to set up all tables, RLS policies, and triggers
-- ============================================================================

-- ============================================================================
-- 1. COMPANIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.companies (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Company members can read their own company
CREATE POLICY "Company members can read"
  ON public.companies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.company_id = companies.id
      AND profiles.id = auth.uid()
    )
  );

-- Only admins can create/update companies
CREATE POLICY "Admins can insert companies"
  ON public.companies FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update companies"
  ON public.companies FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.companies;

-- ============================================================================
-- 2. PROFILES TABLE - Add company_id if missing
-- ============================================================================

-- Create profiles table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'employee')),
  hourly_rate numeric(10,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Add company_id column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'company_id'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN updated_at timestamptz DEFAULT now() NOT NULL;
  END IF;
END $$;

-- Create index for company lookups
CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON public.profiles(company_id);

-- Update RLS policies for profiles with company isolation
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;

-- Users can read their own profile
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can read profiles in their company
CREATE POLICY "profiles_select_company"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = auth.uid()
      AND p2.company_id = profiles.company_id
    )
  );

-- Users can update their own profile (name only)
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admins can update any profile in their company
CREATE POLICY "profiles_update_admin"
  ON public.profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = auth.uid()
      AND p2.role = 'admin'
      AND p2.company_id = profiles.company_id
    )
  );

-- Admins can insert profiles in their company
CREATE POLICY "profiles_insert_admin"
  ON public.profiles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = auth.uid()
      AND p2.role = 'admin'
      AND p2.company_id = company_id
    )
  );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- ============================================================================
-- 3. JOBS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Add company_id if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'jobs'
    AND column_name = 'company_id'
  ) THEN
    ALTER TABLE public.jobs ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_jobs_company_id ON public.jobs(company_id);

-- Update RLS for jobs with company isolation
DROP POLICY IF EXISTS "Anyone can read jobs" ON public.jobs;
DROP POLICY IF EXISTS "Admins can insert jobs" ON public.jobs;
DROP POLICY IF EXISTS "Admins can update jobs" ON public.jobs;
DROP POLICY IF EXISTS "Admins can delete jobs" ON public.jobs;

-- Company members can read active jobs
CREATE POLICY "jobs_select"
  ON public.jobs FOR SELECT
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND (p.company_id = jobs.company_id OR p.role = 'admin')
    )
  );

-- Admins can insert jobs in their company
CREATE POLICY "jobs_insert"
  ON public.jobs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND p.company_id = company_id
    )
  );

-- Admins can update jobs
CREATE POLICY "jobs_update"
  ON public.jobs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND p.company_id = jobs.company_id
    )
  );

-- Admins can delete jobs
CREATE POLICY "jobs_delete"
  ON public.jobs FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;

-- ============================================================================
-- 4. TASKS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  job_name text NOT NULL DEFAULT '',
  due_date date,
  priority text NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'in_progress', 'completed')),
  checklist jsonb NOT NULL DEFAULT '[]',
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Add missing columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'tasks'
    AND column_name = 'company_id'
  ) THEN
    ALTER TABLE public.tasks ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'tasks'
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.tasks ADD COLUMN updated_at timestamptz DEFAULT now() NOT NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'tasks'
    AND column_name = 'updated_by'
  ) THEN
    ALTER TABLE public.tasks ADD COLUMN updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tasks_company_id ON public.tasks(company_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON public.tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);

-- Update RLS for tasks with company isolation
DROP POLICY IF EXISTS "tasks_select_employee" ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;

-- Company members can see tasks in their company
CREATE POLICY "tasks_select"
  ON public.tasks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.company_id = tasks.company_id
    )
  );

-- Users can create tasks in their company
CREATE POLICY "tasks_insert"
  ON public.tasks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.company_id = company_id
    )
  );

-- Users can update tasks in their company (assigned, created, or admin)
CREATE POLICY "tasks_update"
  ON public.tasks FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.company_id = tasks.company_id
      AND (
        p.role = 'admin'
        OR assigned_to = auth.uid()
        OR created_by = auth.uid()
      )
    )
  );

-- Users can delete tasks (admin or creator)
CREATE POLICY "tasks_delete"
  ON public.tasks FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND (
        p.role = 'admin'
        OR created_by = (SELECT created_by FROM public.tasks WHERE id = tasks.id)
      )
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;

-- ============================================================================
-- 5. TIME_ENTRIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.time_entries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  job_name text NOT NULL,
  clock_in timestamptz NOT NULL DEFAULT now(),
  clock_out timestamptz,
  hourly_rate numeric(10,2) NOT NULL DEFAULT 0,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Add company_id if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'time_entries'
    AND column_name = 'company_id'
  ) THEN
    ALTER TABLE public.time_entries ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_time_entries_company_id ON public.time_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user_id ON public.time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_clock_in ON public.time_entries(clock_in);

-- Update RLS for time_entries
DROP POLICY IF EXISTS "time_entries_select" ON public.time_entries;
DROP POLICY IF EXISTS "time_entries_insert" ON public.time_entries;
DROP POLICY IF EXISTS "time_entries_update" ON public.time_entries;

-- Users can see their own entries; admins see all in company
CREATE POLICY "time_entries_select"
  ON public.time_entries FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND p.company_id = time_entries.company_id
    )
  );

-- Users can clock in within their company
CREATE POLICY "time_entries_insert"
  ON public.time_entries FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.company_id = company_id
      AND (p.id = user_id OR p.role = 'admin')
    )
  );

-- Users can clock out their own; admins can update any
CREATE POLICY "time_entries_update"
  ON public.time_entries FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND p.company_id = time_entries.company_id
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.time_entries;

-- ============================================================================
-- 6. CHAT_MESSAGES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  text text NOT NULL,
  image_url text,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Add company_id if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'chat_messages'
    AND column_name = 'company_id'
  ) THEN
    ALTER TABLE public.chat_messages ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chat_messages_company_id ON public.chat_messages(company_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON public.chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.chat_messages(created_at);

-- Update RLS for chat_messages
DROP POLICY IF EXISTS "chat_select" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_insert" ON public.chat_messages;

-- Company members can read all chat messages in their company
CREATE POLICY "chat_messages_select"
  ON public.chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.company_id = chat_messages.company_id
    )
  );

-- Company members can send messages
CREATE POLICY "chat_messages_insert"
  ON public.chat_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.company_id = company_id
      AND p.id = sender_id
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- ============================================================================
-- 7. EMPLOYEE_LOCATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.employee_locations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy double precision,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_locations_user_id ON public.employee_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_employee_locations_updated_at ON public.employee_locations(updated_at);

-- RLS for employee_locations (should already exist from previous migration)
DROP POLICY IF EXISTS "Users can upsert own location" ON public.employee_locations;
DROP POLICY IF EXISTS "Users can update own location" ON public.employee_locations;
DROP POLICY IF EXISTS "Admins can read all locations" ON public.employee_locations;
DROP POLICY IF EXISTS "Users can read own location" ON public.employee_locations;

CREATE POLICY "employee_locations_upsert_own"
  ON public.employee_locations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "employee_locations_update_own"
  ON public.employee_locations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "employee_locations_select_admin"
  ON public.employee_locations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
  );

CREATE POLICY "employee_locations_select_own"
  ON public.employee_locations FOR SELECT
  USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_locations;

-- ============================================================================
-- 8. TRIGGERS FOR updated_at
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply trigger to profiles
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Apply trigger to tasks
DROP TRIGGER IF EXISTS update_tasks_updated_at ON public.tasks;
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Apply trigger to companies
DROP TRIGGER IF EXISTS update_companies_updated_at ON public.companies;
CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 9. AUTO-CREATE PROFILE TRIGGER
-- ============================================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  -- For first user ever, create admin with default company
  IF NOT EXISTS (SELECT 1 FROM public.profiles) THEN
    -- Create default company
    INSERT INTO public.companies (id, name)
    VALUES (gen_random_uuid(), 'Default Company')
    ON CONFLICT DO NOTHING;
    
    -- Get the company ID
    DECLARE
      default_company_id uuid;
    BEGIN
      SELECT id INTO default_company_id FROM public.companies LIMIT 1;
      
      -- Create admin profile
      INSERT INTO public.profiles (id, full_name, role, company_id, hourly_rate)
      VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        'admin',
        default_company_id,
        0
      );
    END;
  ELSE
    -- For subsequent users, they need to be assigned to a company by admin
    -- This is handled via the invite API which sets company_id
    INSERT INTO public.profiles (id, full_name, role, hourly_rate)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
      COALESCE(NEW.raw_user_meta_data->>'role', 'employee'),
      COALESCE((NEW.raw_user_meta_data->>'hourly_rate')::numeric, 0)
    );
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();

-- ============================================================================
-- 10. SEED DATA (Optional - for testing)
-- ============================================================================

-- Uncomment to add sample jobs
-- INSERT INTO public.jobs (name, is_active) VALUES
--   ('Riverside Kitchen Remodel', true),
--   ('Oak Street New Build', true),
--   ('Henderson Backyard Deck', true)
-- ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Run these after migration to verify setup:
-- SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position;
-- SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;
