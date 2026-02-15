-- Create quiz_results table for tracking practice history
CREATE TABLE IF NOT EXISTS public.quiz_results (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  question_id uuid REFERENCES public.questions(id) ON DELETE CASCADE NOT NULL,
  is_correct boolean DEFAULT false,
  answer text, -- User's answer content
  question_type text,
  source_type text CHECK (source_type IN ('recitation', 'quiz')) DEFAULT 'quiz',
  attempt_at timestamptz DEFAULT now()
);

-- Ensure columns exist (for existing tables)
DO $$
BEGIN
    BEGIN
        ALTER TABLE public.quiz_results ADD COLUMN answer text;
    EXCEPTION
        WHEN duplicate_column THEN RAISE NOTICE 'column answer already exists in quiz_results.';
    END;
    
    BEGIN
        ALTER TABLE public.quiz_results ADD COLUMN question_type text;
    EXCEPTION
        WHEN duplicate_column THEN RAISE NOTICE 'column question_type already exists in quiz_results.';
    END;
    
    BEGIN
        ALTER TABLE public.quiz_results ADD COLUMN source_type text CHECK (source_type IN ('recitation', 'quiz')) DEFAULT 'quiz';
    EXCEPTION
        WHEN duplicate_column THEN RAISE NOTICE 'column source_type already exists in quiz_results.';
    END;
END $$;

-- Enable RLS
ALTER TABLE public.quiz_results ENABLE ROW LEVEL SECURITY;

-- Policies (Drop first to allow re-running)

-- Users can view their own results
DROP POLICY IF EXISTS "Users can view own quiz results" ON public.quiz_results;
CREATE POLICY "Users can view own quiz results" 
ON public.quiz_results FOR SELECT 
USING (auth.uid() = user_id);

-- Users can insert their own results
DROP POLICY IF EXISTS "Users can insert own quiz results" ON public.quiz_results;
CREATE POLICY "Users can insert own quiz results" 
ON public.quiz_results FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Admins can view all results
DROP POLICY IF EXISTS "Admins can view all quiz results" ON public.quiz_results;
CREATE POLICY "Admins can view all quiz results" 
ON public.quiz_results FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

-- Indexes
DROP INDEX IF EXISTS idx_quiz_results_user;
CREATE INDEX idx_quiz_results_user ON public.quiz_results(user_id);

DROP INDEX IF EXISTS idx_quiz_results_question;
CREATE INDEX idx_quiz_results_question ON public.quiz_results(question_id);
