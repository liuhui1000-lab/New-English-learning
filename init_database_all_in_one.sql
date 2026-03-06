-- ==========================================
-- New English Learning App Database Schema
-- All-in-one Initialization Script
-- ==========================================

-- --------------------------------------------------------
-- 1. Profiles Table & Authentication Triggers
-- --------------------------------------------------------
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users NOT NULL PRIMARY KEY,
  username TEXT UNIQUE,
  display_name TEXT,
  role TEXT DEFAULT 'student' CHECK (role IN ('admin', 'student')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'frozen')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone." ON public.profiles FOR SELECT USING (TRUE);
CREATE POLICY "Users can insert their own profile." ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile." ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Trigger to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, role, status)
  VALUES (new.id, new.raw_user_meta_data->>'username', 'student', 'pending');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Helper function to check if current user is admin (used in RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- --------------------------------------------------------
-- 2. System Settings Table
-- --------------------------------------------------------
CREATE TABLE public.system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage system settings" 
ON public.system_settings FOR ALL TO authenticated 
USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Insert default settings
INSERT INTO public.system_settings (key, value, description) VALUES
('baidu_ocr_api_key', '', 'Baidu OCR API Key'),
('baidu_ocr_secret_key', '', 'Baidu OCR Secret Key'),
('llm_provider', 'deepseek', 'LLM Provider (deepseek, openai, claude)'),
('llm_api_key', '', 'LLM API Key'),
('llm_model_name', 'deepseek-chat', 'LLM Model Name'),
('ai_provider', 'deepseek', 'Selected AI Provider (deepseek, zhipu, openai)'),
('ai_api_key', '', 'API Key for the selected provider'),
('ai_base_url', 'https://api.deepseek.com', 'Base URL for API calls'),
('ai_model', 'deepseek-chat', 'Model name to use')
ON CONFLICT (key) DO NOTHING;

-- --------------------------------------------------------
-- 3. Source Materials and Import History
-- --------------------------------------------------------
CREATE TABLE public.source_materials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  file_url TEXT, -- Supabase Storage URL
  uploaded_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.import_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  filename TEXT NOT NULL,
  import_date TIMESTAMPTZ DEFAULT NOW(),
  question_count INT DEFAULT 0,
  uploaded_by UUID REFERENCES public.profiles(id)
);

-- --------------------------------------------------------
-- 4. Questions Table
-- --------------------------------------------------------
CREATE TABLE public.questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT CHECK (type IN ('word_transformation', 'collocation', 'grammar', 'mistake', 'vocabulary')),
  content TEXT, -- The question body or OCR text
  answer TEXT,
  hint TEXT,
  explanation TEXT, -- Detailed explanation of the answer/grammar point
  image_url TEXT, -- Fallback for bad OCR
  tags JSONB DEFAULT '[]'::jsonb, -- e.g. ["Grammar:Tense"]
  occurrence_count INT DEFAULT 1,
  
  is_ai_analyzed BOOLEAN DEFAULT FALSE,
  
  source_material_id UUID REFERENCES public.source_materials(id) ON DELETE CASCADE,
  import_history_id UUID REFERENCES public.import_history(id) ON DELETE CASCADE,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_questions_tags ON public.questions USING gin (tags);

-- --------------------------------------------------------
-- 5. User Progress Table
-- --------------------------------------------------------
CREATE TABLE public.user_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id),
  question_id UUID REFERENCES public.questions(id),
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'learning', 'reviewing', 'mastered')),
  attempts INT DEFAULT 0,
  last_practiced_at TIMESTAMPTZ,
  next_review_at TIMESTAMPTZ,
  
  consecutive_correct INT DEFAULT 0,
  review_stage INT DEFAULT 0,
  ease_factor FLOAT DEFAULT 2.5,
  
  UNIQUE(user_id, question_id)
);

CREATE INDEX idx_user_progress_user ON public.user_progress(user_id);

-- --------------------------------------------------------
-- 6. Error Analysis Reports Table
-- --------------------------------------------------------
CREATE TABLE public.error_analysis_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  report_content TEXT NOT NULL,
  mistake_count INT DEFAULT 0,
  triggered_by UUID REFERENCES public.profiles(id) DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.error_analysis_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own reports" ON public.error_analysis_reports FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all reports" ON public.error_analysis_reports FOR SELECT USING (public.is_admin());
CREATE POLICY "Users can insert their own reports" ON public.error_analysis_reports FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can insert reports" ON public.error_analysis_reports FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Users can delete their own reports" ON public.error_analysis_reports FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins can delete any reports" ON public.error_analysis_reports FOR DELETE USING (public.is_admin());

-- --------------------------------------------------------
-- 7. Quiz Results Table
-- --------------------------------------------------------
CREATE TABLE public.quiz_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE NOT NULL,
  is_correct BOOLEAN DEFAULT false,
  answer TEXT,
  question_type TEXT,
  source_type TEXT CHECK (source_type IN ('recitation', 'quiz')) DEFAULT 'quiz',
  attempt_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.quiz_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own quiz results" ON public.quiz_results FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own quiz results" ON public.quiz_results FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all quiz results" ON public.quiz_results FOR SELECT USING (public.is_admin());

CREATE INDEX idx_quiz_results_user ON public.quiz_results(user_id);
CREATE INDEX idx_quiz_results_question ON public.quiz_results(question_id);

-- --------------------------------------------------------
-- 8. Final Configuration
-- --------------------------------------------------------
NOTIFY pgrst, 'reload config';
