-- Add explanation column to questions table
ALTER TABLE questions 
ADD COLUMN IF NOT EXISTS explanation TEXT;

-- Add description for the column (optional but good practice)
COMMENT ON COLUMN questions.explanation IS 'Detailed explanation of the answer/grammar point';
