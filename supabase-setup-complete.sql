-- ============================================================
-- Complete Database Setup for ProTask App
-- Run this in Supabase Dashboard → SQL Editor at:
-- https://thwdaicnysqgjszcndkl.supabase.co/dashboard/sql/editor
-- ============================================================

-- ============================================================
-- PART 1: Setup profiles table with company_id
-- ============================================================

-- Create profiles table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'employee')),
  hourly_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT TRUE,
  company_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add company_id to profiles if it doesn't exist (for existing tables)
DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN company_id uuid;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- Create a companies table for multi-tenant isolation
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Insert a default company if none exists
INSERT INTO public.companies (id, name) 
SELECT '00000000-0000-0000-0000-000000000001', 'Default Company'
WHERE NOT EXISTS (SELECT 1 FROM public.companies);

-- Set all existing profiles to the default company
UPDATE public.profiles 
SET company_id = '00000000-0000-0000-0000-000000000001'
WHERE company_id IS NULL;

-- Enable RLS on profiles and companies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Profiles policies
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT
  USING (
    auth.uid() = id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_update_admin" ON public.profiles FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Companies policies (admins can see all, employees see their own)
DROP POLICY IF EXISTS "companies_select" ON public.companies;
CREATE POLICY "companies_select" ON public.companies FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

-- ============================================================
-- PART 2: Setup tasks table
-- ============================================================

-- Create tasks table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  job_name text NOT NULL DEFAULT '',
  due_date date,
  priority text NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'in_progress', 'completed')),
  checklist jsonb NOT NULL DEFAULT '[]',
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by_name text
);

-- Add missing columns if table already exists
DO $$ BEGIN
  ALTER TABLE public.tasks ADD COLUMN company_id uuid REFERENCES public.companies(id);
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.tasks ADD COLUMN updated_by uuid REFERENCES public.profiles(id);
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.tasks ADD COLUMN updated_by_name text;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.tasks ADD COLUMN updated_at timestamptz DEFAULT now();
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- Enable RLS on tasks
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Backfill company_id from creator's profile for existing tasks
UPDATE public.tasks t
SET company_id = p.company_id
FROM public.profiles p
WHERE t.created_by = p.id AND t.company_id IS NULL;

-- Backfill updated_by to created_by for existing tasks
UPDATE public.tasks 
SET updated_by = created_by, updated_at = created_at
WHERE updated_by IS NULL;

-- ============================================================
-- PART 3: Create trigger for auto-updating task fields
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_task_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  
  BEGIN
    SELECT full_name INTO NEW.updated_by_name 
    FROM public.profiles 
    WHERE id = auth.uid();
  EXCEPTION
    WHEN NO_DATA_FOUND THEN NEW.updated_by_name = NULL;
  END;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_updated_at_trigger ON public.tasks;
CREATE TRIGGER tasks_updated_at_trigger
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_task_update();

-- ============================================================
-- PART 4: Setup RLS policies for tasks
-- ============================================================

DROP POLICY IF EXISTS "tasks_select_company" ON public.tasks;
CREATE POLICY "tasks_select_company" ON public.tasks FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;
CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================
-- PART 5: Setup other tables (time_entries, chat_messages, jobs)
-- ============================================================

-- Time entries table
CREATE TABLE IF NOT EXISTS public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  job_name text NOT NULL,
  clock_in timestamptz NOT NULL DEFAULT now(),
  clock_out timestamptz,
  hourly_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

-- Add company_id to time_entries if it doesn't exist
DO $$ BEGIN
  ALTER TABLE public.time_entries ADD COLUMN company_id uuid REFERENCES public.companies(id);
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- Backfill company_id for time_entries
UPDATE public.time_entries t
SET company_id = p.company_id
FROM public.profiles p
WHERE t.user_id = p.id AND t.company_id IS NULL;

DROP POLICY IF EXISTS "time_entries_select" ON public.time_entries;
CREATE POLICY "time_entries_select" ON public.time_entries FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "time_entries_insert" ON public.time_entries;
CREATE POLICY "time_entries_insert" ON public.time_entries FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "time_entries_update" ON public.time_entries;
CREATE POLICY "time_entries_update" ON public.time_entries FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Chat messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  text text NOT NULL,
  image_url text,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Add company_id if it doesn't exist
DO $$ BEGIN
  ALTER TABLE public.chat_messages ADD COLUMN company_id uuid REFERENCES public.companies(id);
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

DROP POLICY IF EXISTS "chat_select" ON public.chat_messages;
CREATE POLICY "chat_select" ON public.chat_messages FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "chat_insert" ON public.chat_messages;
CREATE POLICY "chat_insert" ON public.chat_messages FOR INSERT
  WITH CHECK (sender_id = auth.uid());

-- Jobs table
CREATE TABLE IF NOT EXISTS public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT TRUE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- Add company_id if it doesn't exist
DO $$ BEGIN
  ALTER TABLE public.jobs ADD COLUMN company_id uuid REFERENCES public.companies(id);
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

DROP POLICY IF EXISTS "jobs_select" ON public.jobs;
CREATE POLICY "jobs_select" ON public.jobs FOR SELECT
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "jobs_insert" ON public.jobs;
CREATE POLICY "jobs_insert" ON public.jobs FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "jobs_update" ON public.jobs;
CREATE POLICY "jobs_update" ON public.jobs FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "jobs_delete" ON public.jobs;
CREATE POLICY "jobs_delete" ON public.jobs FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- PART 6: Enable Realtime for live updates
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.time_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- ============================================================
-- PART 7: Create function to handle new user signup
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, company_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'role')::text, 'employee'),
    '00000000-0000-0000-0000-000000000001' -- Default company
  );
  RETURN NEW;
END;
$$;

-- Create trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- Setup complete!
-- ============================================================
