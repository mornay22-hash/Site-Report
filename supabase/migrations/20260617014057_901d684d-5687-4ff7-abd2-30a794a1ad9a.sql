
-- 1. Reports: planning fields
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS planned_visit_date date,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- 2. Inspection sections
CREATE TABLE IF NOT EXISTS public.inspection_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  area_name text NOT NULL,
  area_slug text NOT NULL DEFAULT '',
  area_description text,
  sort_order integer NOT NULL DEFAULT 0,
  status text,
  repairs_required boolean NOT NULL DEFAULT false,
  repair_description text,
  priority text,
  assigned_to text,
  target_completion_date date,
  estimated_cost numeric,
  follow_up_required boolean NOT NULL DEFAULT false,
  comments text,
  action_required text,
  is_ad_hoc boolean NOT NULL DEFAULT false,
  category text,
  next_photo_seq integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspection_sections TO authenticated;
GRANT ALL ON public.inspection_sections TO service_role;

ALTER TABLE public.inspection_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own inspection_sections" ON public.inspection_sections
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER inspection_sections_touch
  BEFORE UPDATE ON public.inspection_sections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER inspection_sections_bump_report
  AFTER INSERT OR UPDATE OR DELETE ON public.inspection_sections
  FOR EACH ROW EXECUTE FUNCTION public.bump_report_updated_at();

CREATE INDEX IF NOT EXISTS idx_sections_report ON public.inspection_sections(report_id, sort_order);

-- 3. Photos: optional link to section
ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES public.inspection_sections(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_photos_section ON public.photos(section_id);

-- 4. Templates
CREATE TABLE IF NOT EXISTS public.inspection_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspection_templates TO authenticated;
GRANT ALL ON public.inspection_templates TO service_role;
ALTER TABLE public.inspection_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view templates" ON public.inspection_templates
  FOR SELECT TO authenticated USING (is_system = true OR user_id = auth.uid());
CREATE POLICY "manage own templates" ON public.inspection_templates
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.inspection_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.inspection_templates(id) ON DELETE CASCADE,
  area_name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspection_template_items TO authenticated;
GRANT ALL ON public.inspection_template_items TO service_role;
ALTER TABLE public.inspection_template_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view template items" ON public.inspection_template_items
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.inspection_templates t
            WHERE t.id = template_id AND (t.is_system = true OR t.user_id = auth.uid()))
  );
CREATE POLICY "manage own template items" ON public.inspection_template_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inspection_templates t WHERE t.id = template_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.inspection_templates t WHERE t.id = template_id AND t.user_id = auth.uid()));

-- 5. Seed default template
DO $$
DECLARE tpl_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.inspection_templates WHERE is_system = true AND name = 'Standard Property Site Visit') THEN
    INSERT INTO public.inspection_templates (user_id, name, is_default, is_system)
    VALUES (NULL, 'Standard Property Site Visit', true, true)
    RETURNING id INTO tpl_id;

    INSERT INTO public.inspection_template_items (template_id, area_name, sort_order) VALUES
      (tpl_id, 'Bathrooms', 1),
      (tpl_id, 'Tenant signage', 2),
      (tpl_id, 'Parking area', 3),
      (tpl_id, 'Landscaping', 4),
      (tpl_id, 'Upkeep', 5),
      (tpl_id, 'Refuse area', 6),
      (tpl_id, 'Tenant shopfront', 7),
      (tpl_id, 'Compliance', 8),
      (tpl_id, 'Lights', 9),
      (tpl_id, 'Marketing / Signage', 10),
      (tpl_id, 'Service providers', 11),
      (tpl_id, 'General', 12);
  END IF;
END $$;

-- 6. Photo number allocator per section
CREATE OR REPLACE FUNCTION public.allocate_section_photo_number(_section_id uuid)
RETURNS TABLE(photo_number text, seq integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s RECORD;
  r RECORD;
  new_seq integer;
  slug text;
  pn text;
BEGIN
  SELECT * INTO s FROM public.inspection_sections WHERE id = _section_id AND user_id = auth.uid() FOR UPDATE;
  IF s IS NULL THEN RAISE EXCEPTION 'Section not found'; END IF;
  SELECT * INTO r FROM public.reports WHERE id = s.report_id AND user_id = auth.uid();
  IF r IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;

  new_seq := s.next_photo_seq + 1;
  UPDATE public.inspection_sections SET next_photo_seq = new_seq WHERE id = _section_id;

  slug := upper(regexp_replace(regexp_replace(coalesce(s.area_slug, s.area_name), '[^a-zA-Z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g'));
  pn := r.site_code || '-' || to_char(coalesce(r.planned_visit_date, r.report_date), 'YYYY-MM-DD') || '-' || slug || '-' || lpad(new_seq::text, 3, '0');

  RETURN QUERY SELECT pn, new_seq;
END $$;
