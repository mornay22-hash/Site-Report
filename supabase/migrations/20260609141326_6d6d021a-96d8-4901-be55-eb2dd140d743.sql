
REVOKE EXECUTE ON FUNCTION public.allocate_photo_number(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.allocate_entry_number(UUID) FROM PUBLIC, anon;

-- Storage policies: users can only touch objects under their own user-id folder in report-photos
CREATE POLICY "own photos read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'report-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own photos insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'report-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own photos delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'report-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
