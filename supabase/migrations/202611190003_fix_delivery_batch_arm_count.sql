-- Avoid the parameterless count(*) aggregate that the hosted database rejects
-- while executing this RPC. A delivery batch has at most ten items, so a small
-- deterministic loop keeps the readiness check simple and reliable.
create or replace function public.arm_campaign_batch(
  p_batch_id uuid,
  p_user_id uuid
)
returns table (
  batch_id uuid,
  armed_at timestamptz,
  campaign_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_batch public.campaign_batches%rowtype;
  batch_item record;
  item_count integer := 0;
  ready_count integer := 0;
  armed_timestamp timestamptz := now();
begin
  select batch.*
  into target_batch
  from public.campaign_batches as batch
  where batch.id = p_batch_id
    and batch.user_id = p_user_id
    and batch.status in ('draft', 'prepared')
    and batch.armed_at is null
  for update;

  if not found then
    return;
  end if;

  for batch_item in
    select
      item.preparation_status,
      campaign.status as campaign_status,
      campaign.brevo_campaign_id
    from public.campaign_batch_items as item
    join public.campaigns as campaign
      on campaign.id = item.campaign_id
     and campaign.user_id = p_user_id
    where item.batch_id = p_batch_id
  loop
    item_count := item_count + 1;

    if batch_item.preparation_status = 'prepared'
      and batch_item.campaign_status = 'draft'
      and batch_item.brevo_campaign_id is not null then
      ready_count := ready_count + 1;
    end if;
  end loop;

  if item_count < 1 or item_count > 10 or ready_count <> item_count then
    raise exception 'campaign_batch_not_ready'
      using errcode = 'P0001';
  end if;

  update public.campaign_batches as batch
  set
    status = 'waiting',
    prepared_at = coalesce(batch.prepared_at, armed_timestamp),
    armed_at = armed_timestamp,
    claimed_at = null,
    completed_at = null,
    last_error = null,
    updated_at = armed_timestamp
  where batch.id = p_batch_id;

  update public.campaigns as campaign
  set
    cron_armed_at = armed_timestamp,
    last_error = null
  from public.campaign_batch_items as item
  where item.batch_id = p_batch_id
    and item.campaign_id = campaign.id
    and campaign.user_id = p_user_id
    and campaign.status = 'draft';

  return query
  select p_batch_id, armed_timestamp, item_count;
end;
$$;

revoke all on function public.arm_campaign_batch(uuid, uuid) from public;
revoke all on function public.arm_campaign_batch(uuid, uuid) from anon;
revoke all on function public.arm_campaign_batch(uuid, uuid) from authenticated;
grant execute on function public.arm_campaign_batch(uuid, uuid) to service_role;
