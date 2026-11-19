alter table public.campaigns
  add column if not exists source_campaign_id uuid;

alter table public.campaigns
  drop constraint if exists campaigns_source_campaign_id_fkey;

alter table public.campaigns
  add constraint campaigns_source_campaign_id_fkey
  foreign key (source_campaign_id)
  references public.campaigns(id)
  on delete restrict;

create index if not exists campaigns_source_campaign_id_idx
  on public.campaigns (source_campaign_id)
  where source_campaign_id is not null;

create unique index if not exists campaigns_one_active_resend_draft_idx
  on public.campaigns (source_campaign_id)
  where source_campaign_id is not null and status = 'draft';

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

revoke all on function public.create_or_get_resend_draft(uuid, uuid)
  from public;
revoke all on function public.create_or_get_resend_draft(uuid, uuid)
  from anon;
revoke all on function public.create_or_get_resend_draft(uuid, uuid)
  from authenticated;
grant execute on function public.create_or_get_resend_draft(uuid, uuid)
  to service_role;
