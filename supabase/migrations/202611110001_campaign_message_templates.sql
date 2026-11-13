create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  source_filename text not null,
  html_content text not null,
  asset_urls text[] not null default '{}',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_templates_name_length_check
    check (length(btrim(name)) between 1 and 120),
  constraint email_templates_html_not_blank check (length(btrim(html_content)) > 10)
);

create unique index if not exists email_templates_user_active_name_unique
  on public.email_templates (user_id, lower(btrim(name)))
  where archived_at is null;

create index if not exists email_templates_user_created_at_idx
  on public.email_templates (user_id, created_at desc)
  where archived_at is null;

alter table public.email_templates enable row level security;

drop policy if exists "Users can view their own email templates"
  on public.email_templates;
create policy "Users can view their own email templates"
  on public.email_templates
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own email templates"
  on public.email_templates;
create policy "Users can create their own email templates"
  on public.email_templates
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own email templates"
  on public.email_templates;
create policy "Users can update their own email templates"
  on public.email_templates
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter table public.campaigns
  add column if not exists message_mode text not null default 'manual',
  add column if not exists template_id uuid;

alter table public.campaigns
  drop constraint if exists campaigns_message_mode_check,
  drop constraint if exists campaigns_template_key_check,
  drop constraint if exists campaigns_template_selection_check,
  drop constraint if exists campaigns_template_id_fkey,
  drop column if exists template_key;

alter table public.campaigns
  add constraint campaigns_message_mode_check
  check (message_mode in ('manual', 'template')),
  add constraint campaigns_template_id_fkey
  foreign key (template_id)
  references public.email_templates(id)
  on delete restrict,
  add constraint campaigns_template_selection_check
  check (
    (message_mode = 'manual' and template_id is null)
    or
    (message_mode = 'template' and template_id is not null)
  );

create index if not exists campaigns_template_id_idx
  on public.campaigns (template_id)
  where template_id is not null;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'email-template-assets',
  'email-template-assets',
  true,
  5242880,
  array['image/gif', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Email template assets are publicly readable"
  on storage.objects;
create policy "Email template assets are publicly readable"
  on storage.objects
  for select
  using (bucket_id = 'email-template-assets');

drop policy if exists "Users can upload their own email template assets"
  on storage.objects;
create policy "Users can upload their own email template assets"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'email-template-assets'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "Users can update their own email template assets"
  on storage.objects;
create policy "Users can update their own email template assets"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'email-template-assets'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'email-template-assets'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "Users can delete their own email template assets"
  on storage.objects;
create policy "Users can delete their own email template assets"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'email-template-assets'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
