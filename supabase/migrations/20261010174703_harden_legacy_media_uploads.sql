-- Hardening for legacy Storage buckets still present after moving new media to Cloudflare R2.
-- No files or rows are deleted. Existing media URLs are unchanged.
-- Reject uploads into another member's folder and enforce onboarding completion.
ALTER POLICY "Usuarios autenticados pueden subir fotos de travesias"
ON storage.objects
WITH CHECK (
  bucket_id = 'travesias-fotos'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND gdv_private.can_participate()
);

-- Buckets previously inherited the project default (NULL bucket-specific limits).
-- Keep the 50 MiB ceiling already used by community-media; support legacy videos.
UPDATE storage.buckets
SET file_size_limit = 52428800,
    allowed_mime_types = ARRAY[
      'image/jpeg','image/png','image/webp',
      'video/mp4','video/webm','video/quicktime'
    ]::text[]
WHERE id IN ('travesias-fotos','hangar-fotos');
