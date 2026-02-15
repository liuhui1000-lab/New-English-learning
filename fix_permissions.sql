-- Enable RLS on tables
alter table public.import_history enable row level security;
alter table public.questions enable row level security;

-- Policy: Admins can do ANYTHING on import_history
create policy "Admins can manage import history"
  on public.import_history
  for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- Policy: Admins can do ANYTHING on questions
create policy "Admins can manage questions"
  on public.questions
  for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- Policy: Students can VIEW questions (for practice)
create policy "Students can view questions"
  on public.questions
  for select
  using (true); -- Or restrict based on status if needed
