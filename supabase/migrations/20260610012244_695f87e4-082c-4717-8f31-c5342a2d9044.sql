
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS report_type text NOT NULL DEFAULT 'Site Inspection',
  ADD COLUMN IF NOT EXISTS inspection_time time,
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS recommendation text,
  ADD COLUMN IF NOT EXISTS item_name text;

CREATE TABLE IF NOT EXISTS public.report_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  field text NOT NULL,
  previous_value text,
  new_value text,
  edited_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_edits TO authenticated;
GRANT ALL ON public.report_edits TO service_role;
ALTER TABLE public.report_edits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own report_edits" ON public.report_edits
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS report_edits_report_id_idx ON public.report_edits(report_id);
