-- ============================================================================
-- Fix: handle_new_user() trigger
-- Run this in Supabase SQL Editor to fix signup issues
-- ============================================================================

-- Drop existing trigger first
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Recreate the function with robust error handling
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_company_id uuid;
  v_role text;
BEGIN
  -- Determine role from metadata (default to 'employee')
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'employee');

  -- Try to find an existing company
  SELECT id INTO v_company_id FROM public.companies LIMIT 1;

  -- If no company exists and this is the first user (admin signup), create one
  IF v_company_id IS NULL AND v_role = 'admin' THEN
    INSERT INTO public.companies (name)
    VALUES ('My Company')
    RETURNING id INTO v_company_id;
  END IF;

  -- Create the profile (company_id can be NULL if no company exists yet)
  INSERT INTO public.profiles (id, full_name, role, company_id, hourly_rate)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    v_role,
    v_company_id,
    COALESCE((NEW.raw_user_meta_data->>'hourly_rate')::numeric, 0)
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Re-create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
