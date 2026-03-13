-- Create jobs table for managing job/project names
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- Everyone can read active jobs (needed for time clock & task dropdowns)
CREATE POLICY "Anyone can read jobs"
  ON public.jobs FOR SELECT
  USING (true);

-- Only admins can insert/update/delete jobs
CREATE POLICY "Admins can insert jobs"
  ON public.jobs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update jobs"
  ON public.jobs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete jobs"
  ON public.jobs FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;

-- Seed with initial jobs (optional — remove if not needed)
INSERT INTO public.jobs (name) VALUES
  ('Riverside Kitchen Remodel'),
  ('Oak St. New Build'),
  ('Henderson Backyard')
ON CONFLICT (name) DO NOTHING;
