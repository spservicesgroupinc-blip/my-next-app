-- ─── pay_report_submissions ────────────────────────────────────────────────────
-- Tracks PDF pay reports submitted by employees to their admin for review.

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
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_pay_report_submissions_employee ON public.pay_report_submissions(employee_id);
CREATE INDEX IF NOT EXISTS idx_pay_report_submissions_company  ON public.pay_report_submissions(company_id);
CREATE INDEX IF NOT EXISTS idx_pay_report_submissions_status   ON public.pay_report_submissions(status);
CREATE INDEX IF NOT EXISTS idx_pay_report_submissions_period   ON public.pay_report_submissions(period_start, period_end);

-- Enable Row Level Security
ALTER TABLE public.pay_report_submissions ENABLE ROW LEVEL SECURITY;

-- Employees can see their own submissions
CREATE POLICY "employees_select_own_submissions"
  ON public.pay_report_submissions
  FOR SELECT
  USING (auth.uid() = employee_id);

-- Admins can see all submissions in their company
CREATE POLICY "admins_select_company_submissions"
  ON public.pay_report_submissions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
        AND company_id = pay_report_submissions.company_id
    )
  );

-- Employees can insert their own submissions
CREATE POLICY "employees_insert_own_submissions"
  ON public.pay_report_submissions
  FOR INSERT
  WITH CHECK (auth.uid() = employee_id);

-- Admins can update status (reviewed/approved)
CREATE POLICY "admins_update_submissions"
  ON public.pay_report_submissions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
        AND company_id = pay_report_submissions.company_id
    )
  );
