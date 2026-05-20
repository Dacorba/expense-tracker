
-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "Profiles select own" on public.profiles for select using (auth.uid() = id);
create policy "Profiles insert own" on public.profiles for insert with check (auth.uid() = id);
create policy "Profiles update own" on public.profiles for update using (auth.uid() = id);

-- Expenses
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_name text not null,
  category text not null default 'Outro',
  price numeric(10,2) not null default 0,
  quantity numeric(10,3) not null default 1,
  unit text,
  location text,
  photo_url text,
  protein_g numeric(10,2),
  calories numeric(10,2),
  notes text,
  spent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.expenses enable row level security;

create index expenses_user_spent_idx on public.expenses(user_id, spent_at desc);

create policy "Expenses select own" on public.expenses for select using (auth.uid() = user_id);
create policy "Expenses insert own" on public.expenses for insert with check (auth.uid() = user_id);
create policy "Expenses update own" on public.expenses for update using (auth.uid() = user_id);
create policy "Expenses delete own" on public.expenses for delete using (auth.uid() = user_id);

-- Profile auto-create trigger
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Storage bucket for item photos
insert into storage.buckets (id, name, public) values ('item-photos', 'item-photos', true);

create policy "Item photos public read" on storage.objects for select using (bucket_id = 'item-photos');
create policy "Item photos user insert" on storage.objects for insert with check (
  bucket_id = 'item-photos' and auth.uid()::text = (storage.foldername(name))[1]
);
create policy "Item photos user delete" on storage.objects for delete using (
  bucket_id = 'item-photos' and auth.uid()::text = (storage.foldername(name))[1]
);
