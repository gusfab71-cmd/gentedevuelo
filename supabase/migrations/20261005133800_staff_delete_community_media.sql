create policy "community_media_staff_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'community-media'
  and gdv_private.is_staff()
);
