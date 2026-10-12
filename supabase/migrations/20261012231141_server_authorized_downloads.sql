-- Private object bytes are delivered only after Platum checks current user RLS.
-- CDN-cached direct Storage reads must not become an alternate client path.
drop policy if exists platum_file_download on storage.objects;
create policy platum_server_only_downloads on storage.objects
  as restrictive for select to anon, authenticated
  using (bucket_id <> 'platum-workspace-files');
-- Reserved authenticated uploads and service-role reads remain unchanged.
