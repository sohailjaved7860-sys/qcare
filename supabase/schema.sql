-- =====================================================================
-- QCare Candles: database schema, security rules and order logic (v1)
-- Run ONCE in Supabase: Dashboard > SQL Editor > New query > paste > Run.
--
-- Security model
--   * Row Level Security is ON for every table. The public (anon) key can
--     read or write NO table directly.
--   * The website talks to the database only through the functions marked
--     "PUBLIC API" below. Prices, shipping, coupons and totals are always
--     computed here, never trusted from the browser.
--   * Admin access = a Supabase Auth user whose id is listed in public.admins.
--   * Order status changes go through admin_set_status(), which enforces the
--     allowed transitions, moves stock and writes an audit trail.
-- =====================================================================

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------- tables

create table public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'owner' check (role in ('owner','staff')),
  created_at timestamptz not null default now()
);

create table public.settings (
  id               boolean primary key default true check (id),   -- single row
  accepting_orders boolean not null default true,
  ship_near        int not null default 50  check (ship_near  >= 0),  -- same first PIN digit as home_pin
  ship_far         int not null default 80  check (ship_far   >= 0),
  ship_slab        int not null default 25  check (ship_slab  >= 0),  -- per extra slab
  slab_g           int not null default 500 check (slab_g     >  0),
  free_over        int not null default 999 check (free_over  >= 0),  -- 0 = never free
  home_pin         text not null default '400605' check (home_pin ~ '^[1-9][0-9]{5}$'),
  gst_enabled      boolean not null default false,
  gst_rate         numeric(4,2) not null default 5 check (gst_rate between 0 and 28),
  gstin            text not null default '',
  low_stock        int not null default 10 check (low_stock >= 0)
);

create table public.products (
  id          bigint generated always as identity primary key,
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  name        text not null check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 600),
  tag         text not null default '' check (char_length(tag) <= 24),       -- e.g. Best Seller
  color       text not null default '#D9C79A' check (color  ~ '^#[0-9A-Fa-f]{6}$'),  -- wax colour
  accent      text not null default '#3A2A22' check (accent ~ '^#[0-9A-Fa-f]{6}$'),
  image_url   text not null default '' check (char_length(image_url) <= 400),
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table public.variants (
  id         bigint generated always as identity primary key,
  product_id bigint not null references public.products(id) on delete cascade,
  sku        text not null unique check (sku ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(sku) <= 80),
  label      text not null check (char_length(label) between 1 and 40),     -- Normal / Premium
  price      int not null check (price between 1 and 100000),                -- rupees, what the customer pays
  cost       int not null default 0 check (cost >= 0),                       -- your making cost, for margin reports
  weight_g   int not null default 100 check (weight_g between 1 and 20000),  -- PACKED weight, used for shipping
  stock      int,                                                            -- NULL = stock not tracked
  active     boolean not null default true,
  sort_order int not null default 0
);
create index on public.variants(product_id);

create table public.coupons (
  code        text primary key check (code = upper(code) and code ~ '^[A-Z0-9]{3,20}$'),
  percent_off int not null check (percent_off between 1 and 90),
  min_order   int not null default 0 check (min_order >= 0),
  max_uses    int check (max_uses > 0),          -- NULL = unlimited
  used_count  int not null default 0,
  expires_at  timestamptz,
  active      boolean not null default true
);

create sequence public.order_no_seq start 1001;

create table public.orders (
  id             bigint generated always as identity primary key,
  order_no       text not null unique,
  client_ref     uuid not null unique,            -- idempotency key from the browser
  status         text not null default 'pending_payment' check (status in
                 ('pending_payment','paid','processing','shipped','delivered','cancelled','returned','refunded')),
  name           text not null,
  phone          text not null,
  email          text not null default '',
  addr_line1     text not null,
  addr_line2     text not null default '',
  city           text not null,
  state          text not null,
  pin            text not null,
  note           text not null default '',
  subtotal       int not null,
  discount       int not null default 0,
  shipping       int not null,
  total          int not null,
  gst_included   numeric(10,2) not null default 0,
  coupon_code    text,
  payment_method text not null default 'upi_qr',
  payment_ref    text,                            -- UPI UTR / transaction id checked in your bank app
  stock_deducted boolean not null default false,
  courier        text,
  awb            text,
  ip             text,
  created_at     timestamptz not null default now(),
  paid_at        timestamptz,
  shipped_at     timestamptz,
  delivered_at   timestamptz,
  closed_at      timestamptz
);
create index on public.orders(created_at desc);
create index on public.orders(phone);
create index on public.orders(status);

create table public.order_items (
  id            bigint generated always as identity primary key,
  order_id      bigint not null references public.orders(id) on delete cascade,
  sku           text not null,                    -- snapshot, deliberately no FK
  product_name  text not null,
  variant_label text not null,
  unit_price    int not null,
  unit_cost     int not null default 0,
  weight_g      int not null,
  qty           int not null check (qty between 1 and 200),
  line_total    int not null
);
create index on public.order_items(order_id);

create table public.order_events (                -- audit trail
  id          bigint generated always as identity primary key,
  order_id    bigint not null references public.orders(id) on delete cascade,
  from_status text,
  to_status   text not null,
  note        text not null default '',
  actor       uuid,
  created_at  timestamptz not null default now()
);
create index on public.order_events(order_id);

create table public.stock_moves (                 -- stock movement history
  id         bigint generated always as identity primary key,
  sku        text not null,
  delta      int,
  stock_after int,
  reason     text not null,
  order_id   bigint,
  actor      uuid,
  created_at timestamptz not null default now()
);

create table public.enquiries (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in ('bulk','gift','contact')),
  name       text not null,
  phone      text not null default '',
  email      text not null default '',
  details    jsonb not null default '{}'::jsonb,
  status     text not null default 'new' check (status in ('new','in_progress','quoted','closed')),
  admin_note text not null default '',
  ip         text,
  created_at timestamptz not null default now()
);
create index on public.enquiries(created_at desc);

-- ------------------------------------------------------------ RLS on, anon out

alter table public.admins       enable row level security;
alter table public.settings     enable row level security;
alter table public.products     enable row level security;
alter table public.variants     enable row level security;
alter table public.coupons      enable row level security;
alter table public.orders       enable row level security;
alter table public.order_items  enable row level security;
alter table public.order_events enable row level security;
alter table public.stock_moves  enable row level security;
alter table public.enquiries    enable row level security;

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon, authenticated;

-- Orders, stock and audit rows are written only by the functions below.
revoke insert, update, delete on public.orders, public.order_items, public.order_events,
       public.stock_moves, public.admins from authenticated;
revoke insert, delete on public.settings, public.enquiries from authenticated;
-- Stock can only change through admin_adjust_stock(), so every change is logged.
revoke update on public.variants from authenticated;
grant  update (label, price, cost, weight_g, active, sort_order) on public.variants to authenticated;
revoke update on public.enquiries from authenticated;
grant  update (status, admin_note) on public.enquiries to authenticated;

-- --------------------------------------------------------- admin helpers

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;

create function public.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()) and a.role = 'owner');
$$;

create function public.admin_whoami() returns text
language sql stable security definer set search_path = '' as $$
  select a.role from public.admins a where a.user_id = (select auth.uid());
$$;

-- --------------------------------------------------------------- policies

create policy admins_self     on public.admins       for select to authenticated using (user_id = (select auth.uid()));
create policy settings_read   on public.settings     for select to authenticated using (public.is_admin());
create policy settings_write  on public.settings     for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy products_admin  on public.products     for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy variants_admin  on public.variants     for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy coupons_read    on public.coupons      for select to authenticated using (public.is_admin());
create policy coupons_ins     on public.coupons      for insert to authenticated with check (public.is_owner());
create policy coupons_upd     on public.coupons      for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy coupons_del     on public.coupons      for delete to authenticated using (public.is_owner());
create policy orders_read     on public.orders       for select to authenticated using (public.is_admin());
create policy items_read      on public.order_items  for select to authenticated using (public.is_admin());
create policy events_read     on public.order_events for select to authenticated using (public.is_admin());
create policy moves_read      on public.stock_moves  for select to authenticated using (public.is_admin());
create policy enq_read        on public.enquiries    for select to authenticated using (public.is_admin());
create policy enq_upd         on public.enquiries    for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------ internal helpers

create function private.client_ip() returns text
language plpgsql stable set search_path = '' as $$
declare
  h  text := nullif(current_setting('request.headers', true), '');
  ip text;
begin
  if h is null then return null; end if;
  -- cf-connecting-ip is set by the CDN in front of Supabase and cannot be forged by the caller.
  -- The first x-forwarded-for entry CAN be forged, so it is only a fallback.
  ip := coalesce(nullif(btrim(h::json ->> 'cf-connecting-ip'), ''),
                 nullif(btrim(split_part(h::json ->> 'x-forwarded-for', ',', 1)), ''));
  if ip is null or ip !~ '^[0-9A-Fa-f:.]{3,45}$' then return null; end if;
  return ip;
exception when others then return null;
end $$;

-- The one place prices, coupon, shipping and totals are computed.
create function private.calc(p_items jsonb, p_pin text, p_coupon text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s        public.settings%rowtype;
  it       record;
  vr       record;
  c        public.coupons%rowtype;
  lines    jsonb := '[]'::jsonb;
  subtotal int := 0;
  weight   int := 0;
  discount int := 0;
  net      int;
  shipping int;
  gst      numeric := 0;
  v_code   text := upper(btrim(coalesce(p_coupon, '')));
  cerr     text;
  pin_ok   boolean := coalesce(p_pin, '') ~ '^[1-9][0-9]{5}$';
begin
  select * into s from public.settings limit 1;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'CART_INVALID';
  end if;

  for it in
    select x.e ->> 'sku' as sku, sum((x.e ->> 'qty')::int) as qty, min(x.n) as n
    from jsonb_array_elements(p_items) with ordinality as x(e, n)
    group by 1 order by 3
  loop
    if it.sku is null or it.qty is null or it.qty not between 1 and 200 then
      raise exception 'CART_INVALID';
    end if;
    select v.sku, v.label, v.price, v.cost, v.weight_g, v.stock, p.name
      into vr
      from public.variants v join public.products p on p.id = v.product_id
     where v.sku = it.sku and v.active and p.active;
    if not found then
      raise exception 'ITEM_UNAVAILABLE:%', left(it.sku, 80);
    end if;
    if vr.stock is not null and it.qty > vr.stock then
      raise exception 'OUT_OF_STOCK:% (%)', vr.name, vr.label;
    end if;
    subtotal := subtotal + vr.price * it.qty;
    weight   := weight   + vr.weight_g * it.qty;
    lines := lines || jsonb_build_object(
      'sku', vr.sku, 'name', vr.name, 'label', vr.label, 'unit_price', vr.price,
      'unit_cost', vr.cost, 'weight_g', vr.weight_g, 'qty', it.qty, 'line_total', vr.price * it.qty);
  end loop;

  if v_code <> '' then
    select * into c from public.coupons k where k.code = v_code;
    if not found or not c.active then cerr := 'That code isn''t valid.';
    elsif c.expires_at is not null and c.expires_at < now() then cerr := 'That code has expired.';
    elsif c.max_uses is not null and c.used_count >= c.max_uses then cerr := 'That code has been fully used.';
    elsif subtotal < c.min_order then cerr := 'That code needs a minimum order of ₹' || c.min_order || '.';
    else discount := round(subtotal * c.percent_off / 100.0)::int;
    end if;
  end if;

  net := subtotal - discount;
  if pin_ok then
    if s.free_over > 0 and net >= s.free_over then
      shipping := 0;
    else
      shipping := (case when left(p_pin, 1) = left(s.home_pin, 1) then s.ship_near else s.ship_far end)
                  + s.ship_slab * (greatest(1, ceil(weight::numeric / s.slab_g)::int) - 1);
    end if;
  end if;
  if s.gst_enabled then
    gst := round(net * s.gst_rate / (100 + s.gst_rate), 2);
  end if;

  return jsonb_build_object(
    'lines', lines, 'subtotal', subtotal, 'discount', discount,
    'coupon', case when v_code <> '' and cerr is null then v_code end,
    'coupon_error', cerr, 'weight_g', weight,
    'shipping', shipping, 'total', net + shipping,           -- both NULL until a valid PIN is given
    'gst_included', gst, 'gst_rate', case when s.gst_enabled then s.gst_rate end);
end $$;

-- ============================================================ PUBLIC API
-- These five functions are everything the public website can do.

-- 1. Catalogue + the settings the storefront needs. Never exposes stock counts or costs.
create function public.get_catalog() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'settings', (select jsonb_build_object(
        'accepting_orders', s.accepting_orders, 'ship_near', s.ship_near, 'ship_far', s.ship_far,
        'ship_slab', s.ship_slab, 'slab_g', s.slab_g, 'free_over', s.free_over, 'home_pin', s.home_pin,
        'gst_enabled', s.gst_enabled, 'gst_rate', s.gst_rate, 'gstin', s.gstin)
      from public.settings s limit 1),
    'products', coalesce((select jsonb_agg(jsonb_build_object(
        'slug', p.slug, 'name', p.name, 'description', p.description, 'tag', p.tag,
        'color', p.color, 'accent', p.accent, 'image_url', p.image_url,
        'variants', (select jsonb_agg(jsonb_build_object(
              'sku', v.sku, 'label', v.label, 'price', v.price, 'weight_g', v.weight_g,
              'in_stock', (v.stock is null or v.stock > 0)) order by v.sort_order, v.id)
            from public.variants v where v.product_id = p.id and v.active)
      ) order by p.sort_order, p.id)
      from public.products p
      where p.active and exists (select 1 from public.variants v where v.product_id = p.id and v.active)),
      '[]'::jsonb));
$$;

-- 2. Price a cart (used to show the customer the real total before ordering).
create function public.quote_order(p_items jsonb, p_pin text default null, p_coupon text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.calc(p_items, p_pin, p_coupon) - 'lines' - 'weight_g';
$$;

-- 3. Place an order. Returns the order number and the server-computed total.
create function public.place_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name  text := btrim(coalesce(p ->> 'name', ''));
  v_phone text := regexp_replace(coalesce(p ->> 'phone', ''), '\D', '', 'g');
  v_email text := lower(btrim(coalesce(p ->> 'email', '')));
  v_l1    text := btrim(coalesce(p ->> 'addr_line1', ''));
  v_l2    text := btrim(coalesce(p ->> 'addr_line2', ''));
  v_city  text := btrim(coalesce(p ->> 'city', ''));
  v_state text := btrim(coalesce(p ->> 'state', ''));
  v_pin   text := btrim(coalesce(p ->> 'pin', ''));
  v_note  text := btrim(coalesce(p ->> 'note', ''));
  v_ref   uuid;
  v_ip    text := private.client_ip();
  c       jsonb;
  o       public.orders%rowtype;
  ln      jsonb;
begin
  if coalesce(p ->> 'website', '') <> '' then raise exception 'REJECTED'; end if;   -- honeypot
  if not (select accepting_orders from public.settings limit 1) then raise exception 'CLOSED'; end if;

  begin v_ref := (p ->> 'client_ref')::uuid; exception when others then v_ref := null; end;
  if v_ref is null then raise exception 'INVALID:reference'; end if;

  if char_length(v_phone) = 12 and left(v_phone, 2) = '91' then v_phone := right(v_phone, 10); end if;
  if char_length(v_name) not between 2 and 80        then raise exception 'INVALID:name'; end if;
  if v_phone !~ '^[6-9][0-9]{9}$'                    then raise exception 'INVALID:phone'; end if;
  if v_email <> '' and (char_length(v_email) > 120 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
                                                     then raise exception 'INVALID:email'; end if;
  if char_length(v_l1) not between 3 and 120         then raise exception 'INVALID:address'; end if;
  if char_length(v_l2) > 120                         then raise exception 'INVALID:address'; end if;
  if char_length(v_city) not between 2 and 60        then raise exception 'INVALID:city'; end if;
  if char_length(v_state) not between 2 and 60       then raise exception 'INVALID:state'; end if;
  if v_pin !~ '^[1-9][0-9]{5}$'                      then raise exception 'INVALID:pin'; end if;
  if char_length(v_note) > 200                       then raise exception 'INVALID:note'; end if;

  -- Same browser submitting twice (double tap, retry) gets the same order back.
  select * into o from public.orders where client_ref = v_ref;
  if found then
    return jsonb_build_object('order_no', o.order_no, 'total', o.total, 'subtotal', o.subtotal,
                              'discount', o.discount, 'shipping', o.shipping, 'duplicate', true);
  end if;

  -- Basic flood control. Real bot protection (captcha) is a later step.
  if (select count(*) from public.orders where phone = v_phone and created_at > now() - interval '1 hour') >= 5
     or (v_ip is not null and
         (select count(*) from public.orders where ip = v_ip and created_at > now() - interval '1 hour') >= 15)
     or (select count(*) from public.orders where created_at > now() - interval '1 hour') >= 300 then
    raise exception 'TOO_MANY';
  end if;

  c := private.calc(p -> 'items', v_pin, p ->> 'coupon');
  if c ->> 'coupon_error' is not null then
    raise exception 'COUPON:%', c ->> 'coupon_error';
  end if;

  insert into public.orders (order_no, client_ref, name, phone, email, addr_line1, addr_line2, city, state,
                             pin, note, subtotal, discount, shipping, total, gst_included, coupon_code, ip)
  values ('QC' || nextval('public.order_no_seq'), v_ref, v_name, v_phone, v_email, v_l1, v_l2, v_city, v_state,
          v_pin, v_note, (c ->> 'subtotal')::int, (c ->> 'discount')::int, (c ->> 'shipping')::int,
          (c ->> 'total')::int, (c ->> 'gst_included')::numeric, c ->> 'coupon', v_ip)
  returning * into o;

  for ln in select * from jsonb_array_elements(c -> 'lines') loop
    insert into public.order_items (order_id, sku, product_name, variant_label, unit_price, unit_cost,
                                    weight_g, qty, line_total)
    values (o.id, ln ->> 'sku', ln ->> 'name', ln ->> 'label', (ln ->> 'unit_price')::int,
            (ln ->> 'unit_cost')::int, (ln ->> 'weight_g')::int, (ln ->> 'qty')::int, (ln ->> 'line_total')::int);
  end loop;

  insert into public.order_events (order_id, to_status, note) values (o.id, 'pending_payment', 'Order placed on website');

  return jsonb_build_object('order_no', o.order_no, 'total', o.total, 'subtotal', o.subtotal,
                            'discount', o.discount, 'shipping', o.shipping, 'duplicate', false);
end $$;

-- 4. Order tracking. Needs BOTH the order number and the phone used on the order.
create function public.track_order(p_order_no text, p_phone text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('order_no', o.order_no, 'status', o.status, 'total', o.total,
                            'placed', o.created_at, 'courier', o.courier, 'awb', o.awb,
                            'shipped', o.shipped_at, 'delivered', o.delivered_at)
  from public.orders o
  where o.order_no = upper(btrim(p_order_no))
    and o.phone = right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
$$;

-- 5. Bulk / gifting / contact enquiries.
create function public.submit_enquiry(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_kind  text := coalesce(p ->> 'kind', '');
  v_name  text := btrim(coalesce(p ->> 'name', ''));
  v_phone text := right(regexp_replace(coalesce(p ->> 'phone', ''), '\D', '', 'g'), 10);
  v_email text := lower(btrim(coalesce(p ->> 'email', '')));
  v_det   jsonb := coalesce(p -> 'details', '{}'::jsonb);
  v_ip    text := private.client_ip();
  v_id    bigint;
begin
  if coalesce(p ->> 'website', '') <> '' then raise exception 'REJECTED'; end if;
  if v_kind not in ('bulk', 'gift', 'contact')        then raise exception 'INVALID:kind'; end if;
  if char_length(v_name) not between 2 and 80         then raise exception 'INVALID:name'; end if;
  if v_phone <> '' and v_phone !~ '^[6-9][0-9]{9}$'   then raise exception 'INVALID:phone'; end if;
  if v_kind <> 'contact' and v_phone = ''             then raise exception 'INVALID:phone'; end if;
  if char_length(v_email) > 120                       then raise exception 'INVALID:email'; end if;
  if jsonb_typeof(v_det) <> 'object' or char_length(v_det::text) > 4000 then raise exception 'INVALID:details'; end if;

  if (v_ip is not null and
      (select count(*) from public.enquiries where ip = v_ip and created_at > now() - interval '1 hour') >= 10)
     or (v_phone <> '' and
      (select count(*) from public.enquiries where phone = v_phone and created_at > now() - interval '1 hour') >= 5)
     or (select count(*) from public.enquiries where created_at > now() - interval '1 hour') >= 200 then
    raise exception 'TOO_MANY';
  end if;

  insert into public.enquiries (kind, name, phone, email, details, ip)
  values (v_kind, v_name, v_phone, v_email, v_det, v_ip) returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

-- ============================================================= ADMIN API

-- Move an order to a new status. Enforces the flow, moves stock, logs who did it.
create function public.admin_set_status(
  p_order_id bigint, p_status text,
  p_payment_ref text default null, p_courier text default null, p_awb text default null, p_note text default null)
returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  o    public.orders%rowtype;
  it   record;
  left_ int;
  v_old text;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  v_old := o.status;

  if not (
       (v_old = 'pending_payment' and p_status in ('paid', 'cancelled'))
    or (v_old = 'paid'            and p_status in ('processing', 'shipped', 'cancelled', 'refunded'))
    or (v_old = 'processing'      and p_status in ('shipped', 'cancelled', 'refunded'))
    or (v_old = 'shipped'         and p_status in ('delivered', 'returned'))
    or (v_old = 'delivered'       and p_status in ('refunded'))
    or (v_old = 'returned'        and p_status in ('refunded'))
    or (v_old = 'cancelled'       and p_status in ('refunded') and o.paid_at is not null)
  ) then
    raise exception 'BAD_TRANSITION:% -> %', v_old, p_status;
  end if;

  if p_status = 'paid' then
    if btrim(coalesce(p_payment_ref, '')) = '' then raise exception 'PAYMENT_REF_REQUIRED'; end if;
    for it in select sku, qty, product_name, variant_label from public.order_items where order_id = o.id loop
      update public.variants set stock = stock - it.qty
       where sku = it.sku and stock is not null returning stock into left_;
      if found then
        if left_ < 0 then raise exception 'OUT_OF_STOCK:% (%)', it.product_name, it.variant_label; end if;
        insert into public.stock_moves (sku, delta, stock_after, reason, order_id, actor)
        values (it.sku, -it.qty, left_, 'Order ' || o.order_no || ' paid', o.id, auth.uid());
      end if;
    end loop;
    if o.coupon_code is not null then
      update public.coupons set used_count = used_count + 1 where code = o.coupon_code;
    end if;
    o.payment_ref := left(btrim(p_payment_ref), 60);
    o.paid_at := now();
    o.stock_deducted := true;
  elsif p_status = 'shipped' then
    if btrim(coalesce(p_courier, '')) = '' then raise exception 'COURIER_REQUIRED'; end if;
    o.courier := left(btrim(p_courier), 60);
    o.awb := nullif(left(btrim(coalesce(p_awb, '')), 60), '');
    o.shipped_at := now();
  elsif p_status = 'delivered' then
    o.delivered_at := now();
  elsif p_status = 'cancelled' then
    -- Goods never left, so put the stock back. (A 'returned' parcel is NOT auto-restocked:
    -- inspect it, then use admin_adjust_stock.)
    if o.stock_deducted then
      for it in select sku, qty from public.order_items where order_id = o.id loop
        update public.variants set stock = stock + it.qty
         where sku = it.sku and stock is not null returning stock into left_;
        if found then
          insert into public.stock_moves (sku, delta, stock_after, reason, order_id, actor)
          values (it.sku, it.qty, left_, 'Order ' || o.order_no || ' cancelled', o.id, auth.uid());
        end if;
      end loop;
      o.stock_deducted := false;
    end if;
    o.closed_at := now();
  elsif p_status in ('refunded', 'returned') then
    o.closed_at := now();
  end if;

  o.status := p_status;
  update public.orders set status = o.status, payment_ref = o.payment_ref, paid_at = o.paid_at,
         stock_deducted = o.stock_deducted, courier = o.courier, awb = o.awb, shipped_at = o.shipped_at,
         delivered_at = o.delivered_at, closed_at = o.closed_at
   where id = o.id;
  insert into public.order_events (order_id, from_status, to_status, note, actor)
  values (o.id, v_old, p_status, left(coalesce(p_note, ''), 300), auth.uid());
  return o;
end $$;

-- Set stock for a SKU (NULL = stop tracking). Every change is logged.
create function public.admin_adjust_stock(p_sku text, p_stock int, p_reason text default 'Manual adjustment')
returns int language plpgsql security definer set search_path = '' as $$
declare old_ int;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_stock is not null and p_stock not between 0 and 1000000 then raise exception 'INVALID:stock'; end if;
  select stock into old_ from public.variants where sku = p_sku for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  update public.variants set stock = p_stock where sku = p_sku;
  insert into public.stock_moves (sku, delta, stock_after, reason, actor)
  values (p_sku, case when p_stock is null or old_ is null then null else p_stock - old_ end, p_stock,
          left(coalesce(nullif(btrim(p_reason), ''), 'Manual adjustment'), 200), auth.uid());
  return p_stock;
end $$;

-- Dashboard numbers. "received" counts only orders you have marked paid.
create function public.admin_stats(p_from timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare f timestamptz := coalesce(p_from, '-infinity'::timestamptz);
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'by_status', coalesce((select jsonb_object_agg(status, n) from
        (select status, count(*) n from public.orders where created_at >= f group by status) t), '{}'::jsonb),
    'orders', (select count(*) from public.orders where created_at >= f),
    'customers', (select count(distinct phone) from public.orders where created_at >= f),
    'repeat_customers', (select count(*) from (select phone from public.orders
        where status in ('paid','processing','shipped','delivered') group by phone having count(*) > 1) t),
    'received', coalesce((select sum(total) from public.orders
        where created_at >= f and status in ('paid','processing','shipped','delivered')), 0),
    'awaiting_payment', coalesce((select sum(total) from public.orders
        where created_at >= f and status = 'pending_payment'), 0),
    'refunded', coalesce((select sum(total) from public.orders where created_at >= f and status = 'refunded'), 0),
    'shipping_charged', coalesce((select sum(shipping) from public.orders
        where created_at >= f and status in ('paid','processing','shipped','delivered')), 0),
    'discounts', coalesce((select sum(discount) from public.orders
        where created_at >= f and status in ('paid','processing','shipped','delivered')), 0),
    'goods_margin', coalesce((select sum(i.line_total - i.unit_cost * i.qty) from public.order_items i
        join public.orders o on o.id = i.order_id
        where o.created_at >= f and o.status in ('paid','processing','shipped','delivered')), 0),
    'costs_missing', exists (select 1 from public.variants where active and cost = 0),
    'top', coalesce((select jsonb_agg(t) from (select i.product_name as name, i.variant_label as label,
          sum(i.qty) as qty, sum(i.line_total) as amount
        from public.order_items i join public.orders o on o.id = i.order_id
        where o.created_at >= f and o.status in ('paid','processing','shipped','delivered')
        group by 1, 2 order by 3 desc limit 8) t), '[]'::jsonb),
    'low_stock', coalesce((select jsonb_agg(t) from (select p.name, v.label, v.sku, v.stock
        from public.variants v join public.products p on p.id = v.product_id
        where v.active and p.active and v.stock is not null
          and v.stock <= (select low_stock from public.settings limit 1)
        order by v.stock limit 30) t), '[]'::jsonb),
    'new_enquiries', (select count(*) from public.enquiries where status = 'new'));
end $$;

-- -------------------------------------------------- function permissions
-- Nothing is callable unless granted here.
revoke execute on all functions in schema public  from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

grant execute on function public.get_catalog()                    to anon, authenticated;
grant execute on function public.quote_order(jsonb, text, text)   to anon, authenticated;
grant execute on function public.place_order(jsonb)               to anon, authenticated;
grant execute on function public.track_order(text, text)          to anon, authenticated;
grant execute on function public.submit_enquiry(jsonb)            to anon, authenticated;

grant execute on function public.is_admin()                       to authenticated;
grant execute on function public.is_owner()                       to authenticated;
grant execute on function public.admin_whoami()                   to authenticated;
grant execute on function public.admin_set_status(bigint, text, text, text, text, text) to authenticated;
grant execute on function public.admin_adjust_stock(text, int, text)                    to authenticated;
grant execute on function public.admin_stats(timestamptz)         to authenticated;

-- ------------------------------------------------------------- seed data

insert into public.settings default values;

insert into public.products (slug, name, color, accent, image_url, sort_order) values
  ('jasmine',    'Jasmine',    '#FBF6E3', '#25251F', 'assets/labels/jasmine.webp',    1),
  ('cinnamon',   'Cinnamon',   '#A9683A', '#6B3A1A', 'assets/labels/cinnamon.webp',   2),
  ('sandalwood', 'Sandalwood', '#D2A770', '#3A2A22', 'assets/labels/sandalwood.webp', 3),
  ('mix-fruit',  'Mix Fruit',  '#D8505E', '#B0262F', 'assets/labels/mix-fruit.webp',  4),
  ('orange',     'Orange',     '#F29A3A', '#E8731A', 'assets/labels/orange.webp',     5),
  ('lavender',   'Lavender',   '#A895D8', '#5B4BA3', 'assets/labels/lavender.webp',   6),
  ('rose',       'Rose',       '#E0858F', '#B5302B', 'assets/labels/rose.webp',       7),
  ('musk',       'Musk',       '#C9A6C4', '#46464F', 'assets/labels/musk.webp',       8),
  ('aqua',       'Aqua',       '#7BC1D8', '#1B6A9C', 'assets/labels/aqua.webp',       9),
  ('vanilla',    'Vanilla',    '#F3E3B4', '#2A2A26', 'assets/labels/vanilla.webp',   10);

-- Prices from the current site. weight_g is the PACKED shipping weight estimate: weigh a
-- packed parcel and correct it in the admin. Stock starts untracked (NULL).
insert into public.variants (product_id, sku, label, price, weight_g, sort_order)
select p.id, p.slug || '-' || lower(t.label), t.label, t.price, 100, t.n
from public.products p cross join (values ('Normal', 80, 1), ('Premium', 100, 2)) as t(label, price, n);

-- Sample coupon from the old site, created switched OFF.
insert into public.coupons (code, percent_off, active) values ('WELCOME10', 10, false);

-- ------------------------------------------- product image uploads (Storage)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('product-images', 'product-images', true, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
    on conflict (id) do nothing;
    execute $p$create policy "qcare admins read product images" on storage.objects for select to authenticated
             using (bucket_id = 'product-images' and public.is_admin())$p$;
    execute $p$create policy "qcare admins add product images" on storage.objects for insert to authenticated
             with check (bucket_id = 'product-images' and public.is_admin())$p$;
    execute $p$create policy "qcare admins change product images" on storage.objects for update to authenticated
             using (bucket_id = 'product-images' and public.is_admin())$p$;
    execute $p$create policy "qcare admins delete product images" on storage.objects for delete to authenticated
             using (bucket_id = 'product-images' and public.is_admin())$p$;
  end if;
end $$;

-- ---------------------------------------------------------------- NEXT
-- Make yourself the owner (after creating your user under Authentication > Users):
--   insert into public.admins (user_id, role)
--   select id, 'owner' from auth.users where email = 'YOUR-LOGIN-EMAIL';
