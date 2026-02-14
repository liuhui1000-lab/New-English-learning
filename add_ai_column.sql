
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'questions' AND column_name = 'is_ai_analyzed') THEN
        ALTER TABLE questions ADD COLUMN is_ai_analyzed BOOLEAN DEFAULT FALSE;
    END IF;
END $$;
