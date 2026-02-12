-- Add progress tracking fields for Recitation Module
ALTER TABLE public.user_progress 
ADD COLUMN IF NOT EXISTS consecutive_correct int DEFAULT 0,
ADD COLUMN IF NOT EXISTS ease_factor float DEFAULT 2.5,
ADD COLUMN IF NOT EXISTS review_stage int DEFAULT 0, -- 0=New, 1=1d, 2=2d, etc.
ADD COLUMN IF NOT EXISTS next_review_date timestamptz DEFAULT now();

-- Ensure unique constraint is correct for upserts
ALTER TABLE public.user_progress DROP CONSTRAINT IF EXISTS user_progress_user_id_question_id_key;
ALTER TABLE public.user_progress ADD CONSTRAINT user_progress_unique_pair UNIQUE (user_id, question_id);
