
DO $$
BEGIN
    -- Drop the existing constraint if it exists
    ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_type_check;

    -- Add the updated constraint including all current types
    ALTER TABLE questions ADD CONSTRAINT questions_type_check 
    CHECK (type IN ('grammar', 'word_transformation', 'sentence_transformation', 'collocation', 'vocabulary', 'reading', 'listening'));
END $$;
