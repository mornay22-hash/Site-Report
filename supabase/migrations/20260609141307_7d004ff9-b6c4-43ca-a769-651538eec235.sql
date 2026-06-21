
-- Reports
CREATE TABLE public.reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  report_name TEXT NOT NULL,
  site_name TEXT NOT NULL,
  site_code TEXT NOT NULL,
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  area TEXT,
  inspector_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','archived')),
  next_photo_seq INTEGER NOT NULL DEFAULT 0,
  next_entry_number INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own reports" ON public.reports FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Entries
CREATE TABLE public.entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  entry_number INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority TEXT,
  category TEXT,
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (report_id, entry_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entries TO authenticated;
GRANT ALL ON public.entries TO service_role;
ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own entries" ON public.entries FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX entries_report_idx ON public.entries(report_id);

-- Photos
CREATE TABLE public.photos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  entry_id UUID REFERENCES public.entries(id) ON DELETE SET NULL,
  photo_number TEXT NOT NULL,
  seq INTEGER NOT NULL,
  image_path TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (report_id, photo_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.photos TO authenticated;
GRANT ALL ON public.photos TO service_role;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own photos" ON public.photos FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX photos_report_idx ON public.photos(report_id);
CREATE INDEX photos_entry_idx ON public.photos(entry_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER reports_touch BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER entries_touch BEFORE UPDATE ON public.entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Bump report.updated_at when entries/photos change
CREATE OR REPLACE FUNCTION public.bump_report_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE rid UUID;
BEGIN
  rid := COALESCE(NEW.report_id, OLD.report_id);
  UPDATE public.reports SET updated_at = now() WHERE id = rid;
  RETURN NULL;
END $$;
CREATE TRIGGER entries_bump_report AFTER INSERT OR UPDATE OR DELETE ON public.entries
  FOR EACH ROW EXECUTE FUNCTION public.bump_report_updated_at();
CREATE TRIGGER photos_bump_report AFTER INSERT OR UPDATE OR DELETE ON public.photos
  FOR EACH ROW EXECUTE FUNCTION public.bump_report_updated_at();

-- Allocate next photo number atomically
CREATE OR REPLACE FUNCTION public.allocate_photo_number(_report_id UUID)
RETURNS TABLE(photo_number TEXT, seq INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; new_seq INTEGER; pn TEXT;
BEGIN
  SELECT * INTO r FROM public.reports WHERE id = _report_id AND user_id = auth.uid() FOR UPDATE;
  IF r IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;
  new_seq := r.next_photo_seq + 1;
  UPDATE public.reports SET next_photo_seq = new_seq WHERE id = _report_id;
  pn := r.site_code || '-' || to_char(r.report_date, 'YYYY-MM-DD') || '-' || lpad(new_seq::text, 3, '0');
  RETURN QUERY SELECT pn, new_seq;
END $$;
GRANT EXECUTE ON FUNCTION public.allocate_photo_number(UUID) TO authenticated;

-- Allocate next entry number atomically
CREATE OR REPLACE FUNCTION public.allocate_entry_number(_report_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_n INTEGER;
BEGIN
  UPDATE public.reports SET next_entry_number = next_entry_number + 1
    WHERE id = _report_id AND user_id = auth.uid()
    RETURNING next_entry_number INTO new_n;
  IF new_n IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;
  RETURN new_n;
END $$;
GRANT EXECUTE ON FUNCTION public.allocate_entry_number(UUID) TO authenticated;
