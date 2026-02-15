-- Create a table for public profiles (extends auth.users)
create table public.profiles (
  id uuid references auth.users not null primary key,
  username text unique,
  display_name text,
  role text default 'student' check (role in ('admin', 'student')),
  status text default 'pending' check (status in ('pending', 'active', 'frozen')),
  created_at timestamptz default now(),
  last_login timestamptz
);

-- Enable RLS
alter table public.profiles enable row level security;

-- Policies for profiles
create policy "Public profiles are viewable by everyone." on public.profiles
  for select using (true);

create policy "Users can insert their own profile." on public.profiles
  for insert with check (auth.uid() = id);

create policy "Users can update own profile." on public.profiles
  for update using (auth.uid() = id);

-- Trigger to handle new user registration
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.profiles (id, username, role, status)
  values (new.id, new.raw_user_meta_data->>'username', 'student', 'pending');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- System Settings Table
create table public.system_settings (
  key text primary key,
  value text,
  description text
);
-- Seed default settings
insert into system_settings (key, value, description) values
('baidu_ocr_api_key', '', 'Baidu OCR API Key'),
('baidu_ocr_secret_key', '', 'Baidu OCR Secret Key'),
('llm_provider', 'deepseek', 'LLM Provider (deepseek, openai, claude)'),
('llm_api_key', '', 'LLM API Key'),
('llm_model_name', 'deepseek-chat', 'LLM Model Name');


-- Source Materials (PDFs/Docs)
create table public.source_materials (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  file_url text, -- Supabase Storage URL
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- Import History (For batch management)
create table public.import_history (
  id uuid default gen_random_uuid() primary key,
  filename text not null,
  import_date timestamptz default now(),
  question_count int default 0,
  uploaded_by uuid references public.profiles(id)
);

-- Questions Table
create table public.questions (
  id uuid default gen_random_uuid() primary key,
  type text check (type in ('word_transformation', 'collocation', 'grammar', 'mistake', 'vocabulary')),
  content text, -- The question body or OCR text
  answer text,
  hint text,
  explanation text,
  image_url text, -- Fallback for bad OCR
  tags jsonb default '[]'::jsonb, -- e.g. ["Grammar:Tense"]
  occurrence_count int default 1,
  
  source_material_id uuid references public.source_materials(id) on delete cascade,
  import_history_id uuid references public.import_history(id) on delete cascade,
  
  created_at timestamptz default now()
);

-- User Progress (Study Records)
create table public.user_progress (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id),
  question_id uuid references public.questions(id),
  status text default 'new' check (status in ('new', 'learning', 'reviewing', 'mastered')),
  attempts int default 0,
  last_practiced_at timestamptz,
  next_review_at timestamptz,
  
  -- Recitation Module Fields
  consecutive_correct int default 0, -- Track 2x consecutive pass rule
  review_stage int default 0, -- Ebbinghaus stage (0-7)
  ease_factor float default 2.5, -- SM-2 Ease Factor
  
  unique(user_id, question_id)
);

-- Indexes for performance
create index idx_questions_tags on public.questions using gin (tags);
create index idx_user_progress_user on public.user_progress(user_id);
