alter table public.campaigns
  add column if not exists cron_armed_at timestamptz,
  add column if not exists send_attempted_at timestamptz,
  add column if not exists status_checked_at timestamptz,
  add column if not exists last_error text;

create unique index if not exists campaigns_single_cron_slot_idx
  on public.campaigns ((true))
  where cron_armed_at is not null and status = 'draft';

create index if not exists campaigns_sending_status_checked_idx
  on public.campaigns (status_checked_at)
  where status = 'sending';

create or replace function public.claim_armed_campaign()
returns table (campaign_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidate as (
    select id
    from public.campaigns
    where cron_armed_at is not null
      and status = 'draft'
    order by cron_armed_at asc
    limit 1
    for update skip locked
  ), claimed as (
    update public.campaigns as campaign
    set
      status = 'sending',
      send_attempted_at = now(),
      cron_armed_at = null,
      last_error = null
    from candidate
    where campaign.id = candidate.id
      and campaign.status = 'draft'
      and campaign.cron_armed_at is not null
    returning campaign.id
  )
  select claimed.id from claimed;
end;
$$;

revoke all on function public.claim_armed_campaign() from public;
revoke all on function public.claim_armed_campaign() from anon;
revoke all on function public.claim_armed_campaign() from authenticated;
grant execute on function public.claim_armed_campaign() to service_role;

