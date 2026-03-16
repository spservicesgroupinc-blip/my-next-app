-- ─── task_photos ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_photos (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      uuid        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  company_id   uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  uploader_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  storage_path text        NOT NULL,
  file_name    text        NOT NULL,
  file_size    integer     NOT NULL,
  mime_type    text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_photos_task_id    ON public.task_photos(task_id);
CREATE INDEX IF NOT EXISTS idx_task_photos_company_id ON public.task_photos(company_id);

ALTER TABLE public.task_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_members_select_task_photos"
  ON public.task_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND company_id = task_photos.company_id
    )
  );

CREATE POLICY "company_members_insert_task_photos"
  ON public.task_photos FOR INSERT
  WITH CHECK (
    auth.uid() = uploader_id AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND company_id = task_photos.company_id
    )
  );

CREATE POLICY "uploader_or_admin_delete_task_photos"
  ON public.task_photos FOR DELETE
  USING (
    auth.uid() = uploader_id OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin' AND company_id = task_photos.company_id
    )
  );

-- ─── job_photos ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_photos (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       uuid        NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  company_id   uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  uploader_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  storage_path text        NOT NULL,
  file_name    text        NOT NULL,
  file_size    integer     NOT NULL,
  mime_type    text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_photos_job_id     ON public.job_photos(job_id);
CREATE INDEX IF NOT EXISTS idx_job_photos_company_id ON public.job_photos(company_id);

ALTER TABLE public.job_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_members_select_job_photos"
  ON public.job_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND company_id = job_photos.company_id
    )
  );

CREATE POLICY "company_members_insert_job_photos"
  ON public.job_photos FOR INSERT
  WITH CHECK (
    auth.uid() = uploader_id AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND company_id = job_photos.company_id
    )
  );

CREATE POLICY "uploader_or_admin_delete_job_photos"
  ON public.job_photos FOR DELETE
  USING (
    auth.uid() = uploader_id OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin' AND company_id = job_photos.company_id
    )
  );
