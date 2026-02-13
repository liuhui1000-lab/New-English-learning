-- 1. Ensure columns exist (Idempotent)
ALTER TABLE user_progress ADD COLUMN IF NOT EXISTS consecutive_correct INTEGER DEFAULT 0;
ALTER TABLE user_progress ADD COLUMN IF NOT EXISTS review_stage INTEGER DEFAULT 0;
ALTER TABLE user_progress ADD COLUMN IF NOT EXISTS next_review_due TIMESTAMPTZ;

-- 2. Force Schema Cache Reload (by notifying PostgREST)
NOTIFY pgrst, 'reload schema';

-- 3. Verify RLS (Just in case)
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;

-- 4. Create Policy if missing (Idempotent-ish check)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'user_progress' 
        AND policyname = 'Users can insert their own progress'
    ) THEN
        CREATE POLICY "Users can insert their own progress" 
        ON user_progress FOR INSERT 
        TO authenticated 
        WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'user_progress' 
        AND policyname = 'Users can update their own progress'
    ) THEN
        CREATE POLICY "Users can update their own progress" 
        ON user_progress FOR UPDATE
        TO authenticated 
        USING (auth.uid() = user_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'user_progress' 
        AND policyname = 'Users can read their own progress'
    ) THEN
        CREATE POLICY "Users can read their own progress" 
        ON user_progress FOR SELECT
        TO authenticated 
        USING (auth.uid() = user_id);
    END IF;
END $$;
