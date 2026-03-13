-- Employee GPS locations for live map tracking
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.employee_locations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy double precision,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id)
);

-- Enable RLS
ALTER TABLE public.employee_locations ENABLE ROW LEVEL SECURITY;

-- Employees can upsert their own location
CREATE POLICY "Users can upsert own location"
  ON public.employee_locations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own location"
  ON public.employee_locations FOR UPDATE
  USING (auth.uid() = user_id);

-- Admins can read all locations
CREATE POLICY "Admins can read all locations"
  ON public.employee_locations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Employees can read their own location
CREATE POLICY "Users can read own location"
  ON public.employee_locations FOR SELECT
  USING (auth.uid() = user_id);

-- Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_locations;

-- Index for fast lookups
CREATE INDEX idx_employee_locations_user_id ON public.employee_locations(user_id);
CREATE INDEX idx_employee_locations_updated_at ON public.employee_locations(updated_at);
