
-- Roles
create type public.app_role as enum ('admin', 'telecaller');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  profile_image text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

-- Security definer to check role (avoids recursive RLS)
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles where user_id = _user_id and role = _role
  )
$$;

create or replace function public.get_user_role(_user_id uuid)
returns app_role
language sql stable security definer set search_path = public
as $$
  select role from public.user_roles where user_id = _user_id limit 1
$$;

-- Leads
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  mobile_number text not null,
  city text,
  interested_course text,
  lead_status text not null default 'New Lead',
  feedback_notes text,
  follow_up_date timestamptz,
  assigned_to uuid references auth.users(id) on delete set null,
  priority text not null default 'Medium',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Calls
create table public.calls (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  telecaller_id uuid not null references auth.users(id) on delete cascade,
  customer_name text not null,
  mobile_number text not null,
  call_status text not null,
  call_notes text,
  follow_up_date timestamptz,
  created_at timestamptz not null default now()
);

-- Followups
create table public.followups (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  telecaller_id uuid not null references auth.users(id) on delete cascade,
  followup_date timestamptz not null,
  notes text,
  status text not null default 'Pending',
  created_at timestamptz not null default now()
);

-- Notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  message text,
  read_status boolean not null default false,
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.leads enable row level security;
alter table public.calls enable row level security;
alter table public.followups enable row level security;
alter table public.notifications enable row level security;

-- Profiles policies
create policy "view own profile" on public.profiles for select to authenticated
  using (auth.uid() = id or public.has_role(auth.uid(), 'admin'));
create policy "update own profile" on public.profiles for update to authenticated
  using (auth.uid() = id or public.has_role(auth.uid(), 'admin'));
create policy "insert own profile" on public.profiles for insert to authenticated
  with check (auth.uid() = id);
create policy "admin delete profile" on public.profiles for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- User roles policies
create policy "view own roles" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "admin manage roles" on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Leads policies
create policy "leads select" on public.leads for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or assigned_to = auth.uid() or created_by = auth.uid());
create policy "leads insert" on public.leads for insert to authenticated
  with check (auth.uid() is not null);
create policy "leads update" on public.leads for update to authenticated
  using (public.has_role(auth.uid(), 'admin') or assigned_to = auth.uid());
create policy "leads delete" on public.leads for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- Calls policies
create policy "calls select" on public.calls for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or telecaller_id = auth.uid());
create policy "calls insert" on public.calls for insert to authenticated
  with check (telecaller_id = auth.uid());
create policy "calls update" on public.calls for update to authenticated
  using (public.has_role(auth.uid(), 'admin') or telecaller_id = auth.uid());
create policy "calls delete" on public.calls for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- Followups policies
create policy "followups select" on public.followups for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or telecaller_id = auth.uid());
create policy "followups insert" on public.followups for insert to authenticated
  with check (telecaller_id = auth.uid());
create policy "followups update" on public.followups for update to authenticated
  using (public.has_role(auth.uid(), 'admin') or telecaller_id = auth.uid());
create policy "followups delete" on public.followups for delete to authenticated
  using (public.has_role(auth.uid(), 'admin') or telecaller_id = auth.uid());

-- Notifications policies
create policy "notifs select" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notifs update" on public.notifications for update to authenticated using (user_id = auth.uid());
create policy "notifs insert" on public.notifications for insert to authenticated with check (true);

-- Auto-create profile on signup, default role telecaller
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data->>'phone'
  );
  insert into public.user_roles (user_id, role)
  values (new.id, coalesce((new.raw_user_meta_data->>'role')::app_role, 'telecaller'));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Realtime
alter publication supabase_realtime add table public.leads;
alter publication supabase_realtime add table public.calls;
alter publication supabase_realtime add table public.followups;
alter publication supabase_realtime add table public.notifications;
