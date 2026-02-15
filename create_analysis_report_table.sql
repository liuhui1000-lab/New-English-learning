-- Create a table to store AI error analysis reports
create table if not exists public.error_analysis_reports (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  report_content text not null,
  mistake_count int default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.error_analysis_reports enable row level security;

-- Policies
-- Users can see their own reports
create policy "Users can view their own reports"
  on public.error_analysis_reports for select
  using (auth.uid() = user_id);

-- Admins can view all reports
create policy "Admins can view all reports"
  on public.error_analysis_reports for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- Users can insert their own reports (via API triggers usually, but good to have)
create policy "Users can insert their own reports"
  on public.error_analysis_reports for insert
  with check (auth.uid() = user_id);

-- Admins can insert reports for anyone
create policy "Admins can insert reports"
  on public.error_analysis_reports for insert
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );
