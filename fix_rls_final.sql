-- 1. Enable RLS on user_progress (ensure it's on)
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to avoid conflicts (clean slate)
DROP POLICY IF EXISTS "Users can insert their own progress" ON user_progress;
DROP POLICY IF EXISTS "Users can update their own progress" ON user_progress;
DROP POLICY IF EXISTS "Users can read their own progress" ON user_progress;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON user_progress;
DROP POLICY IF EXISTS "Enable read access for own data" ON user_progress;
DROP POLICY IF EXISTS "Enable update for own data" ON user_progress;

-- 3. Create permissive policies for authenticated users
-- INSERT: Allow if user_id matches auth.uid()
CREATE POLICY "Users can insert their own progress" 
ON user_progress FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

-- UPDATE: Allow if user_id matches auth.uid()
CREATE POLICY "Users can update their own progress" 
ON user_progress FOR UPDATE
TO authenticated 
USING (auth.uid() = user_id);

-- SELECT: Allow if user_id matches auth.uid()
CREATE POLICY "Users can read their own progress" 
ON user_progress FOR SELECT
TO authenticated 
USING (auth.uid() = user_id);

-- 4. Grant permissions to authenticated role (just in case)
GRANT SELECT, INSERT, UPDATE ON user_progress TO authenticated;
