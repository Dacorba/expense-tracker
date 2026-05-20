
drop policy "Item photos public read" on storage.objects;
create policy "Item photos owner select" on storage.objects for select using (
  bucket_id = 'item-photos' and auth.uid()::text = (storage.foldername(name))[1]
);

revoke execute on function public.handle_new_user() from anon, authenticated, public;
