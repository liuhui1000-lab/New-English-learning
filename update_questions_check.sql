-- Add 'vocabulary' to the allowed types for questions
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_type_check;

ALTER TABLE public.questions ADD CONSTRAINT questions_type_check 
CHECK (type IN ('word_transformation', 'collocation', 'grammar', 'mistake', 'vocabulary'));
