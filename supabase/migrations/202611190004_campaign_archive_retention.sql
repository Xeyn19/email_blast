alter table public.campaigns
  add column if not exists archived_at timestamptz;

create index if not exists campaigns_user_archived_at_idx
  on public.campaigns (user_id, archived_at desc)
  where archived_at is not null;

-- An archived resend draft must not block a fresh active resend draft.
drop index if exists public.campaigns_one_active_resend_draft_idx;
create unique index campaigns_one_active_resend_draft_idx
  on public.campaigns (source_campaign_id)
  where source_campaign_id is not null
    and status = 'draft'
    and archived_at is null;

create or replace function public.set_campaign_archived(
  p_campaign_id uuid,
  p_user_id uuid,
  p_archive boolean
)
returns table (
  campaign_id uuid,
  archived_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_campaign public.campaigns%rowtype;
  archive_timestamp timestamptz;
begin
  select campaign.*
  into target_campaign
  from public.campaigns as campaign
  where campaign.id = p_campaign_id
    and campaign.user_id = p_user_id
  for update;

  if not found then
    return;
  end if;

  if p_archive then
    if target_campaign.status = 'sending'
      or target_campaign.cron_armed_at is not null
      or exists (
        select 1
        from public.campaign_batch_items as item
        join public.campaign_batches as batch
          on batch.id = item.batch_id
        where item.campaign_id = p_campaign_id
          and batch.status in (
            'draft',
            'preparing',
            'prepared',
            'waiting',
            'sending'
          )
      ) then
      raise exception 'campaign_archive_active_delivery'
        using errcode = 'P0001';
    end if;

    archive_timestamp := coalesce(target_campaign.archived_at, now());

    update public.campaigns as campaign
    set archived_at = archive_timestamp
    where campaign.id = p_campaign_id
      and campaign.user_id = p_user_id;
  else
    archive_timestamp := null;

    update public.campaigns as campaign
    set archived_at = null
    where campaign.id = p_campaign_id
      and campaign.user_id = p_user_id;
  end if;

  return query
  select p_campaign_id, archive_timestamp;
end;
$$;

create or replace function public.purge_expired_campaign_archive()
returns table (purged_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  expired_campaign_ids uuid[];
  deleted_count integer := 0;
begin
  select coalesce(array_agg(expired.id), array[]::uuid[])
  into expired_campaign_ids
  from (
    select campaign.id
    from public.campaigns as campaign
    where campaign.archived_at <= now() - interval '30 days'
      and campaign.status <> 'sending'
      and campaign.cron_armed_at is null
    for update skip locked
  ) as expired;

  if cardinality(expired_campaign_ids) = 0 then
    return query select 0;
    return;
  end if;

  -- A surviving resend remains valid but no longer links to a source that is
  -- being permanently removed.
  update public.campaigns as campaign
  set source_campaign_id = null
  where campaign.source_campaign_id = any(expired_campaign_ids)
    and not (campaign.id = any(expired_campaign_ids));

  delete from public.campaign_batch_items as item
  where item.campaign_id = any(expired_campaign_ids);

  delete from public.campaigns as campaign
  where campaign.id = any(expired_campaign_ids);
  get diagnostics deleted_count = row_count;

  delete from public.campaign_batches as batch
  where batch.status in ('completed', 'completed_with_errors', 'cancelled')
    and not exists (
      select 1
      from public.campaign_batch_items as item
      where item.batch_id = batch.id
    );

  return query select deleted_count;
end;
$$;

create or replace function public.create_or_get_resend_draft(
  p_source_campaign_id uuid,
  p_user_id uuid
)
returns table (
  campaign_id uuid,
  created boolean,
  cron_armed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  source_campaign public.campaigns%rowtype;
  existing_draft public.campaigns%rowtype;
  new_campaign_id uuid;
  eligible_recipient_ids uuid[];
begin
  select campaign.*
  into source_campaign
  from public.campaigns as campaign
  where campaign.id = p_source_campaign_id
    and campaign.user_id = p_user_id
    and campaign.status in ('sent', 'failed')
    and campaign.archived_at is null
  for update;

  if not found then
    return;
  end if;

  select campaign.*
  into existing_draft
  from public.campaigns as campaign
  where campaign.source_campaign_id = p_source_campaign_id
    and campaign.user_id = p_user_id
    and campaign.status = 'draft'
    and campaign.archived_at is null
  order by campaign.created_at desc
  limit 1;

  if found then
    return query
    select existing_draft.id, false, existing_draft.cron_armed_at;
    return;
  end if;

  select coalesce(
    array_agg(contact.id order by selected_recipient.ordinality),
    array[]::uuid[]
  )
  into eligible_recipient_ids
  from unnest(
    coalesce(source_campaign.recipient_contact_ids, array[]::uuid[])
  ) with ordinality as selected_recipient(contact_id, ordinality)
  join public.contacts as contact
    on contact.id = selected_recipient.contact_id
   and contact.user_id = p_user_id
   and contact.status = 'subscribed';

  insert into public.campaigns (
    user_id,
    name,
    subject,
    preview_text,
    html_content,
    message_mode,
    template_id,
    recipient_contact_ids,
    status,
    source_campaign_id
  )
  values (
    p_user_id,
    source_campaign.name || ' — Resend',
    source_campaign.subject,
    source_campaign.preview_text,
    source_campaign.html_content,
    source_campaign.message_mode,
    source_campaign.template_id,
    eligible_recipient_ids,
    'draft',
    source_campaign.id
  )
  returning id into new_campaign_id;

  return query
  select new_campaign_id, true, null::timestamptz;
end;
$$;

revoke all on function public.set_campaign_archived(uuid, uuid, boolean)
  from public;
revoke all on function public.set_campaign_archived(uuid, uuid, boolean)
  from anon;
revoke all on function public.set_campaign_archived(uuid, uuid, boolean)
  from authenticated;
grant execute on function public.set_campaign_archived(uuid, uuid, boolean)
  to service_role;

revoke all on function public.purge_expired_campaign_archive()
  from public;
revoke all on function public.purge_expired_campaign_archive()
  from anon;
revoke all on function public.purge_expired_campaign_archive()
  from authenticated;
grant execute on function public.purge_expired_campaign_archive()
  to service_role;

revoke all on function public.create_or_get_resend_draft(uuid, uuid)
  from public;
revoke all on function public.create_or_get_resend_draft(uuid, uuid)
  from anon;
revoke all on function public.create_or_get_resend_draft(uuid, uuid)
  from authenticated;
grant execute on function public.create_or_get_resend_draft(uuid, uuid)
  to service_role;
