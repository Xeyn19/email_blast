create table if not exists public.campaign_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  status text not null default 'draft',
  prepared_at timestamptz,
  armed_at timestamptz,
  claimed_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_batches_name_length_check
    check (length(btrim(name)) between 1 and 160),
  constraint campaign_batches_status_check
    check (
      status in (
        'draft',
        'preparing',
        'prepared',
        'waiting',
        'sending',
        'completed',
        'completed_with_errors',
        'cancelled'
      )
    ),
  constraint campaign_batches_waiting_requires_armed_at_check
    check (status <> 'waiting' or armed_at is not null)
);

create table if not exists public.campaign_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.campaign_batches(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete restrict,
  position smallint not null,
  preparation_status text not null default 'pending',
  last_error text,
  prepared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_batch_items_position_check
    check (position between 1 and 10),
  constraint campaign_batch_items_preparation_status_check
    check (preparation_status in ('pending', 'preparing', 'prepared', 'failed')),
  constraint campaign_batch_items_batch_campaign_unique
    unique (batch_id, campaign_id),
  constraint campaign_batch_items_batch_position_unique
    unique (batch_id, position),
  constraint campaign_batch_items_campaign_unique
    unique (campaign_id)
);

create index if not exists campaign_batches_user_created_at_idx
  on public.campaign_batches (user_id, created_at desc);

create index if not exists campaign_batch_items_batch_position_idx
  on public.campaign_batch_items (batch_id, position);

create unique index if not exists campaign_batches_single_waiting_idx
  on public.campaign_batches ((true))
  where status = 'waiting' and armed_at is not null;

create or replace function public.touch_campaign_batch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_campaign_batches_updated_at_trigger
  on public.campaign_batches;
create trigger touch_campaign_batches_updated_at_trigger
before update on public.campaign_batches
for each row
execute function public.touch_campaign_batch_updated_at();

drop trigger if exists touch_campaign_batch_items_updated_at_trigger
  on public.campaign_batch_items;
create trigger touch_campaign_batch_items_updated_at_trigger
before update on public.campaign_batch_items
for each row
execute function public.touch_campaign_batch_updated_at();

create or replace function public.protect_campaign_batch_item_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.batch_id is distinct from old.batch_id
    or new.campaign_id is distinct from old.campaign_id
    or new.position is distinct from old.position then
    raise exception 'campaign_batch_item_identity_is_immutable'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_campaign_batch_item_identity_trigger
  on public.campaign_batch_items;
create trigger protect_campaign_batch_item_identity_trigger
before update on public.campaign_batch_items
for each row
execute function public.protect_campaign_batch_item_identity();

alter table public.campaign_batches enable row level security;
alter table public.campaign_batch_items enable row level security;

drop policy if exists "Users can view their own campaign batches"
  on public.campaign_batches;
create policy "Users can view their own campaign batches"
  on public.campaign_batches
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own campaign batches"
  on public.campaign_batches;
create policy "Users can create their own campaign batches"
  on public.campaign_batches
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and status = 'draft'
    and armed_at is null
    and claimed_at is null
    and completed_at is null
  );

drop policy if exists "Users can update their own campaign batches"
  on public.campaign_batches;
create policy "Users can update their own campaign batches"
  on public.campaign_batches
  for update
  to authenticated
  using (
    (select auth.uid()) = user_id
    and status in ('draft', 'preparing', 'prepared')
  )
  with check (
    (select auth.uid()) = user_id
    and status in ('draft', 'preparing', 'prepared', 'cancelled')
    and armed_at is null
    and claimed_at is null
  );

drop policy if exists "Users can delete their own unused campaign batches"
  on public.campaign_batches;
create policy "Users can delete their own unused campaign batches"
  on public.campaign_batches
  for delete
  to authenticated
  using (
    (select auth.uid()) = user_id
    and status in ('draft', 'cancelled')
  );

drop policy if exists "Users can view their own campaign batch items"
  on public.campaign_batch_items;
create policy "Users can view their own campaign batch items"
  on public.campaign_batch_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.campaign_batches as batch
      where batch.id = batch_id
        and batch.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can create their own campaign batch items"
  on public.campaign_batch_items;
create policy "Users can create their own campaign batch items"
  on public.campaign_batch_items
  for insert
  to authenticated
  with check (
    preparation_status = 'pending'
    and
    exists (
      select 1
      from public.campaign_batches as batch
      where batch.id = batch_id
        and batch.user_id = (select auth.uid())
    )
    and exists (
      select 1
      from public.campaigns as campaign
      where campaign.id = campaign_id
        and campaign.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can update their own campaign batch items"
  on public.campaign_batch_items;
create policy "Users can update their own campaign batch items"
  on public.campaign_batch_items
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.campaign_batches as batch
      where batch.id = batch_id
        and batch.user_id = (select auth.uid())
        and batch.status in ('draft', 'preparing', 'prepared')
    )
  )
  with check (
    exists (
      select 1
      from public.campaign_batches as batch
      where batch.id = batch_id
        and batch.user_id = (select auth.uid())
        and batch.status in ('draft', 'preparing', 'prepared')
    )
    and exists (
      select 1
      from public.campaigns as campaign
      where campaign.id = campaign_id
        and campaign.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can remove their own campaign batch items"
  on public.campaign_batch_items;
create policy "Users can remove their own campaign batch items"
  on public.campaign_batch_items
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.campaign_batches as batch
      where batch.id = batch_id
        and batch.user_id = (select auth.uid())
        and batch.status in ('draft', 'preparing', 'prepared')
    )
  );

do $$
declare
  legacy_campaign public.campaigns%rowtype;
  migrated_batch_id uuid;
begin
  select campaign.*
  into legacy_campaign
  from public.campaigns as campaign
  where campaign.status = 'draft'
    and campaign.cron_armed_at is not null
    and not exists (
      select 1
      from public.campaign_batch_items as item
      where item.campaign_id = campaign.id
    )
  order by campaign.cron_armed_at asc
  limit 1;

  if found then
    insert into public.campaign_batches (
      user_id,
      name,
      status,
      prepared_at,
      armed_at
    )
    values (
      legacy_campaign.user_id,
      left('Delivery — ' || legacy_campaign.name, 160),
      'waiting',
      coalesce(legacy_campaign.brevo_synced_at, legacy_campaign.cron_armed_at),
      legacy_campaign.cron_armed_at
    )
    returning id into migrated_batch_id;

    insert into public.campaign_batch_items (
      batch_id,
      campaign_id,
      position,
      preparation_status,
      prepared_at
    )
    values (
      migrated_batch_id,
      legacy_campaign.id,
      1,
      'prepared',
      coalesce(legacy_campaign.brevo_synced_at, legacy_campaign.cron_armed_at)
    );
  end if;
end;
$$;

drop index if exists public.campaigns_single_cron_slot_idx;

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
  item_count integer;
  ready_count integer;
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

  select
    count(*)::integer,
    count(*) filter (
      where item.preparation_status = 'prepared'
        and campaign.status = 'draft'
        and campaign.brevo_campaign_id is not null
    )::integer
  into item_count, ready_count
  from public.campaign_batch_items as item
  join public.campaigns as campaign
    on campaign.id = item.campaign_id
   and campaign.user_id = p_user_id
  where item.batch_id = p_batch_id;

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

create or replace function public.disarm_campaign_batch(
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
  item_count integer;
begin
  select batch.*
  into target_batch
  from public.campaign_batches as batch
  where batch.id = p_batch_id
    and batch.user_id = p_user_id
    and batch.status = 'waiting'
    and batch.armed_at is not null
  for update;

  if not found then
    return;
  end if;

  update public.campaigns as campaign
  set cron_armed_at = null
  from public.campaign_batch_items as item
  where item.batch_id = p_batch_id
    and item.campaign_id = campaign.id
    and campaign.user_id = p_user_id
    and campaign.status = 'draft';

  select count(*)::integer
  into item_count
  from public.campaign_batch_items as item
  where item.batch_id = p_batch_id;

  update public.campaign_batches as batch
  set
    status = 'prepared',
    armed_at = null,
    claimed_at = null,
    last_error = null,
    updated_at = now()
  where batch.id = p_batch_id;

  return query
  select p_batch_id, null::timestamptz, item_count;
end;
$$;

create or replace function public.claim_armed_campaign_batch()
returns table (
  batch_id uuid,
  campaign_ids uuid[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_batch_id uuid;
  claimed_campaign_ids uuid[];
  claimed_at_timestamp timestamptz := now();
begin
  select batch.id
  into claimed_batch_id
  from public.campaign_batches as batch
  where batch.status = 'waiting'
    and batch.armed_at is not null
  order by batch.armed_at asc
  limit 1
  for update skip locked;

  if claimed_batch_id is null then
    return;
  end if;

  with claimed_campaigns as (
    update public.campaigns as campaign
    set
      status = 'sending',
      send_attempted_at = claimed_at_timestamp,
      cron_armed_at = null,
      last_error = null
    from public.campaign_batch_items as item
    where item.batch_id = claimed_batch_id
      and item.campaign_id = campaign.id
      and item.preparation_status = 'prepared'
      and campaign.status = 'draft'
      and campaign.cron_armed_at is not null
    returning campaign.id
  )
  select array_agg(item.campaign_id order by item.position)
  into claimed_campaign_ids
  from public.campaign_batch_items as item
  join claimed_campaigns as claimed
    on claimed.id = item.campaign_id
  where item.batch_id = claimed_batch_id;

  if coalesce(cardinality(claimed_campaign_ids), 0) = 0 then
    update public.campaign_batches as batch
    set
      status = 'completed_with_errors',
      armed_at = null,
      claimed_at = claimed_at_timestamp,
      completed_at = claimed_at_timestamp,
      last_error = 'No prepared campaigns were available to claim.',
      updated_at = claimed_at_timestamp
    where batch.id = claimed_batch_id;
    return;
  end if;

  update public.campaign_batches as batch
  set
    status = 'sending',
    armed_at = null,
    claimed_at = claimed_at_timestamp,
    last_error = null,
    updated_at = claimed_at_timestamp
  where batch.id = claimed_batch_id;

  return query
  select claimed_batch_id, claimed_campaign_ids;
end;
$$;

create or replace function public.remove_campaign_from_batch(
  p_batch_id uuid,
  p_campaign_id uuid,
  p_user_id uuid
)
returns table (
  batch_id uuid,
  remaining_count integer,
  batch_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_batch public.campaign_batches%rowtype;
  deleted_item_id uuid;
  item_count integer;
  next_status text;
begin
  select batch.*
  into target_batch
  from public.campaign_batches as batch
  where batch.id = p_batch_id
    and batch.user_id = p_user_id
    and batch.status in ('draft', 'preparing', 'prepared', 'waiting')
  for update;

  if not found then
    return;
  end if;

  delete from public.campaign_batch_items as item
  where item.batch_id = p_batch_id
    and item.campaign_id = p_campaign_id
  returning item.id into deleted_item_id;

  if deleted_item_id is null then
    return;
  end if;

  update public.campaigns as campaign
  set cron_armed_at = null
  where campaign.id = p_campaign_id
    and campaign.user_id = p_user_id
    and campaign.status = 'draft';

  select count(*)::integer
  into item_count
  from public.campaign_batch_items as item
  where item.batch_id = p_batch_id;

  if item_count = 0 then
    next_status := 'cancelled';
  elsif target_batch.status = 'waiting' then
    next_status := 'waiting';
  elsif not exists (
    select 1
    from public.campaign_batch_items as item
    where item.batch_id = p_batch_id
      and item.preparation_status <> 'prepared'
  ) then
    next_status := 'prepared';
  else
    next_status := 'draft';
  end if;

  update public.campaign_batches as batch
  set
    status = next_status,
    armed_at = case when next_status = 'waiting' then batch.armed_at else null end,
    completed_at = case when next_status = 'cancelled' then now() else batch.completed_at end,
    updated_at = now()
  where batch.id = p_batch_id;

  return query
  select p_batch_id, item_count, next_status;
end;
$$;

-- Disable the legacy one-campaign claim path after existing armed work has
-- been migrated into a delivery batch. This prevents a rolling deployment
-- from claiming the same campaign through both queue implementations.
create or replace function public.claim_armed_campaign()
returns table (campaign_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  return;
end;
$$;

revoke all on function public.arm_campaign_batch(uuid, uuid) from public;
revoke all on function public.arm_campaign_batch(uuid, uuid) from anon;
revoke all on function public.arm_campaign_batch(uuid, uuid) from authenticated;
grant execute on function public.arm_campaign_batch(uuid, uuid) to service_role;

revoke all on function public.disarm_campaign_batch(uuid, uuid) from public;
revoke all on function public.disarm_campaign_batch(uuid, uuid) from anon;
revoke all on function public.disarm_campaign_batch(uuid, uuid) from authenticated;
grant execute on function public.disarm_campaign_batch(uuid, uuid) to service_role;

revoke all on function public.claim_armed_campaign_batch() from public;
revoke all on function public.claim_armed_campaign_batch() from anon;
revoke all on function public.claim_armed_campaign_batch() from authenticated;
grant execute on function public.claim_armed_campaign_batch() to service_role;

revoke all on function public.remove_campaign_from_batch(uuid, uuid, uuid) from public;
revoke all on function public.remove_campaign_from_batch(uuid, uuid, uuid) from anon;
revoke all on function public.remove_campaign_from_batch(uuid, uuid, uuid) from authenticated;
grant execute on function public.remove_campaign_from_batch(uuid, uuid, uuid) to service_role;

revoke all on function public.claim_armed_campaign() from public;
revoke all on function public.claim_armed_campaign() from anon;
revoke all on function public.claim_armed_campaign() from authenticated;
grant execute on function public.claim_armed_campaign() to service_role;

revoke all on function public.protect_campaign_batch_item_identity() from public;
revoke all on function public.protect_campaign_batch_item_identity() from anon;
revoke all on function public.protect_campaign_batch_item_identity() from authenticated;

revoke all on function public.touch_campaign_batch_updated_at() from public;
revoke all on function public.touch_campaign_batch_updated_at() from anon;
revoke all on function public.touch_campaign_batch_updated_at() from authenticated;
