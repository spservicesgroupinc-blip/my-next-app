-- Migration: Fix tasks table schema for proper task editing
-- Run this in Supabase Dashboard → SQL Editor at:
-- https://thwdaicnysqgjszcndkl.supabase.co/dashboard/sql/editor

-- ============================================================
-- STEP 1: Add missing columns to tasks table
-- ============================================================

-- Add company_id column if it doesn't exist (for multi-tenant isolation)
DO $$ BEGIN
  ALTER TABLE public.tasks ADD COLUMN company_id uuid;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- Add updated_by column (references the profile who last edited the task)
DO $$ BEGIN
  ALTER TABLE public.tasks ADD COLUMN updated_by uuid REFERENCES public.profiles(id);
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- Add updated_by_name column (denormalized for easy display)
DO $$ BEGIN
  ALTER TABLE public.tasks ADD COLUMN updated_by_name text;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- Ensure updated_at column exists with default
DO $$ BEGIN
  ALTER TABLE public.tasks ADD COLUMN updated_at timestamptz DEFAULT now();
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- ============================================================
-- STEP 2: Backfill data for existing rows
-- ============================================================

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
-- STEP 3: Create trigger function to auto-update fields
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_task_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Set updated_at to now
  NEW.updated_at = now();
  
  -- Set updated_by to the current user's ID
  NEW.updated_by = auth.uid();
  
  -- Get the current user's name for denormalized storage
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

-- ============================================================
-- STEP 4: Create trigger
-- ============================================================

DROP TRIGGER IF EXISTS tasks_updated_at_trigger ON public.tasks;
CREATE TRIGGER tasks_updated_at_trigger
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_task_update();

-- ============================================================
-- STEP 5: Update RLS policies for proper access control
-- ============================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "tasks_select_company" ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;

-- Select: Users can see tasks from their company
CREATE POLICY "tasks_select_company" ON public.tasks FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Insert: Users can create tasks for their company
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Update: Users can update tasks from their company
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Delete: Creators and admins can delete
CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================
-- STEP 6: Ensure realtime is enabled
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;

-- ============================================================
-- Migration complete!
-- ============================================================
