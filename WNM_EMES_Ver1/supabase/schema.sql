-- =====================================================================
-- WNM-Educational Measurement and Evaluation Section Ver.1
-- โครงสร้างฐานข้อมูล Supabase (รันใน SQL Editor ได้ซ้ำโดยไม่ทำให้ข้อมูลหาย)
-- =====================================================================

-- ---------- 1) บัญชีผู้ใช้ (เจ้าหน้าที่ / หน่วยงานภายนอก) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'agency' check (role in ('staff', 'agency')),
  approved boolean not null default false,
  agency_name text,
  phone text,
  contact text,
  address text,
  created_at timestamptz not null default now()
);

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'staff' and approved);
$$;

create or replace function public.is_approved_agency() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'agency' and approved);
$$;

-- สมัครสมาชิกใหม่ = หน่วยงานภายนอก สถานะรออนุมัติ
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, role, approved, agency_name, phone, contact, address)
  values (new.id, lower(new.email), 'agency', false,
          new.raw_user_meta_data ->> 'agency_name', new.raw_user_meta_data ->> 'phone',
          new.raw_user_meta_data ->> 'contact', new.raw_user_meta_data ->> 'address')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
drop policy if exists "profiles: own or staff read" on public.profiles;
create policy "profiles: own or staff read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());
drop policy if exists "profiles: staff update" on public.profiles;
create policy "profiles: staff update" on public.profiles for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------- 2) ข้อมูลของงานทะเบียน (เฉพาะเจ้าหน้าที่) ----------
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.settings (id, data) values (1, '{}'::jsonb) on conflict (id) do nothing;

create table if not exists public.students (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.fees (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.requests (
  id text primary key,
  agency_id uuid references public.profiles(id) on delete set null,
  email text,
  status text,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists requests_agency_idx on public.requests (agency_id);
create index if not exists requests_email_idx on public.requests (lower(email));

do $$
declare t text;
begin
  foreach t in array array['settings', 'students', 'fees', 'requests'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "staff all" on public.%I', t);
    execute format('create policy "staff all" on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff())', t);
  end loop;
end $$;

-- ---------- 3) ฟังก์ชันสำหรับหน่วยงานภายนอก (เห็นเฉพาะคำขอของตัวเอง) ----------
-- ตัดข้อมูลภายในออก: ประวัติที่ไม่เปิดเผย ผลจับคู่ฐานข้อมูล ค่าบำรุง ลายเซ็น
create or replace function public.request_public(d jsonb) returns jsonb
language sql immutable as $$
  select (d - 'sign' - 'enclosures' - 'showGpa' - 'regNoNote') || jsonb_build_object(
    'timeline', coalesce((select jsonb_agg(e) from jsonb_array_elements(coalesce(d -> 'timeline', '[]'::jsonb)) e
                          where coalesce((e ->> 'pub')::boolean, false)), '[]'::jsonb),
    'persons', coalesce((select jsonb_agg(jsonb_build_object(
                          'id', p ->> 'id', 'prefix', p ->> 'prefix', 'fname', p ->> 'fname', 'lname', p ->> 'lname',
                          'sid', p ->> 'sid', 'gradText', p ->> 'gradText', 'gradDate', p ->> 'gradDate', 'level', p ->> 'level',
                          'result', p ->> 'result', 'note', p ->> 'note'))
                         from jsonb_array_elements(coalesce(d -> 'persons', '[]'::jsonb)) p), '[]'::jsonb));
$$;

create or replace function public.owns_request(rid text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_approved_agency() and exists (
    select 1 from public.requests r
    where r.id = rid and (r.agency_id = auth.uid() or (r.email is not null and lower(r.email) = lower(auth.jwt() ->> 'email'))));
$$;

create or replace function public.my_requests() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public.request_public(r.data) order by r.created_at desc), '[]'::jsonb)
  from public.requests r
  where public.is_approved_agency()
    and (r.agency_id = auth.uid() or (r.email is not null and lower(r.email) = lower(auth.jwt() ->> 'email')));
$$;

-- ส่งคำขอใหม่ หรือแก้ไขคำขอที่เจ้าหน้าที่ส่งกลับ
create or replace function public.submit_request(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  rid text := nullif(p ->> 'id', '');
  ex public.requests%rowtype;
  existed boolean := false;
  nowms bigint := (extract(epoch from now()) * 1000)::bigint;
  persons jsonb;
  atts jsonb;
  d jsonb;
begin
  if not public.is_approved_agency() then
    raise exception 'บัญชีหน่วยงานยังไม่ได้รับการอนุมัติจากโรงเรียน';
  end if;
  if rid is null then rid := gen_random_uuid()::text; end if;
  select * into ex from public.requests where id = rid;
  existed := found;
  if existed and (ex.agency_id is distinct from uid or ex.status <> 'returned') then
    raise exception 'แก้ไขคำขอนี้ไม่ได้';
  end if;
  if jsonb_array_length(coalesce(p -> 'persons', '[]'::jsonb)) = 0 or jsonb_array_length(p -> 'persons') > 500 then
    raise exception 'จำนวนรายชื่อไม่ถูกต้อง';
  end if;

  select jsonb_agg(jsonb_build_object(
           'id', coalesce(e ->> 'id', gen_random_uuid()::text), 'sid', left(coalesce(e ->> 'sid', ''), 20),
           'prefix', left(coalesce(e ->> 'prefix', ''), 60), 'fname', left(coalesce(e ->> 'fname', ''), 100),
           'lname', left(coalesce(e ->> 'lname', ''), 100), 'gradDate', coalesce(e ->> 'gradDate', ''),
           'gradText', left(coalesce(e ->> 'gradText', ''), 40), 'level', left(coalesce(e ->> 'level', ''), 10),
           'result', 'pending', 'matchedId', null, 'auto', '', 'note', '', 'manual', false))
    into persons from jsonb_array_elements(p -> 'persons') e;

  select coalesce(jsonb_agg(jsonb_build_object('name', e ->> 'name', 'size', (e ->> 'size')::bigint, 'type', e ->> 'type', 'path', e ->> 'path', 'data', '')), '[]'::jsonb)
    into atts from jsonb_array_elements(coalesce(p -> 'attachments', '[]'::jsonb)) e
    where coalesce(e ->> 'path', '') like uid::text || '/%';

  d := jsonb_build_object(
    'id', rid, 'source', 'online', 'agencyId', uid::text,
    'agency', left(coalesce(p ->> 'agency', ''), 300), 'to', left(coalesce(p ->> 'to', ''), 300),
    'docNo', left(coalesce(p ->> 'docNo', ''), 100), 'docDate', coalesce(p ->> 'docDate', ''),
    'email', lower(coalesce(p ->> 'email', '')), 'aaddr', left(coalesce(p ->> 'aaddr', ''), 500),
    'aphone', left(coalesce(p ->> 'aphone', ''), 60),
    'form', case when p ->> 'form' = '1' then 1 else 2 end,
    'file', left(coalesce(p ->> 'file', ''), 500),
    'attachments', atts, 'persons', persons,
    'status', 'submitted', 'regNo', '', 'recvDate', '', 'outNo', '', 'outDate', '', 'sentDate', '',
    'submittedAt', nowms,
    'timeline', (case when existed then coalesce(ex.data -> 'timeline', '[]'::jsonb) else '[]'::jsonb end)
                || jsonb_build_array(jsonb_build_object('t', nowms, 'pub', true,
                     'text', case when existed then 'หน่วยงานแก้ไขและส่งคำขออีกครั้ง' else 'หน่วยงานส่งคำขอตรวจสอบออนไลน์' end)));

  insert into public.requests (id, agency_id, email, status, data)
  values (rid, uid, lower(coalesce(p ->> 'email', '')), 'submitted', d)
  on conflict (id) do update set data = excluded.data, status = 'submitted', email = excluded.email, updated_at = now();

  return public.request_public(d);
end $$;

-- ข้อมูลโรงเรียนที่เปิดให้หน่วยงานเห็นได้
create or replace function public.public_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('school', data ->> 'school', 'address', data ->> 'address', 'docPrefix', data ->> 'docPrefix',
                            'phone', data ->> 'phone', 'email', data ->> 'email', 'office', data ->> 'office')
  from public.settings where id = 1;
$$;

revoke execute on function public.submit_request(jsonb), public.my_requests(), public.public_settings(), public.owns_request(text) from public, anon;
grant execute on function public.submit_request(jsonb), public.my_requests(), public.public_settings(), public.owns_request(text) to authenticated;

-- ---------- 4) ที่เก็บไฟล์ ----------
insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('replies', 'replies', false) on conflict (id) do nothing;

-- ไฟล์แนบของหน่วยงาน: อัปโหลดได้เฉพาะโฟลเดอร์ของตัวเอง
drop policy if exists "attachments: agency upload own" on storage.objects;
create policy "attachments: agency upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text and public.is_approved_agency());
drop policy if exists "attachments: read own or staff" on storage.objects;
create policy "attachments: read own or staff" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()));
drop policy if exists "attachments: staff manage" on storage.objects;
create policy "attachments: staff manage" on storage.objects for all to authenticated
  using (bucket_id = 'attachments' and public.is_staff()) with check (bucket_id = 'attachments' and public.is_staff());

-- หนังสือตอบ PDF: เจ้าหน้าที่อัปโหลด หน่วยงานดาวน์โหลดได้เฉพาะคำขอของตัวเอง
drop policy if exists "replies: staff manage" on storage.objects;
create policy "replies: staff manage" on storage.objects for all to authenticated
  using (bucket_id = 'replies' and public.is_staff()) with check (bucket_id = 'replies' and public.is_staff());
drop policy if exists "replies: agency read own" on storage.objects;
create policy "replies: agency read own" on storage.objects for select to authenticated
  using (bucket_id = 'replies' and public.owns_request(regexp_replace(name, '\.pdf$', '')));

-- ---------- 5) ตั้งเจ้าหน้าที่คนแรก ----------
-- 1. Authentication › Users › Add user (ใส่อีเมลและรหัสผ่านของเจ้าหน้าที่)
-- 2. รันคำสั่งนี้ (เปลี่ยนอีเมล):
-- update public.profiles set role = 'staff', approved = true where email = 'watpol@wnm.ac.th';
