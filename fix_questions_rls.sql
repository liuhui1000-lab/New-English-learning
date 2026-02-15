
-- Enable RLS on questions if not already
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Questions are viewable by everyone" ON questions;
DROP POLICY IF EXISTS "Questions are editable by admins" ON questions;
DROP POLICY IF EXISTS "Public read access" ON questions;
DROP POLICY IF EXISTS "Admin full access" ON questions;

-- Create comprehensive policies

-- 1. Read: Everyone can read questions (needed for students too)
CREATE POLICY "Public read access" 
ON questions FOR SELECT 
USING (true);

-- 2. Write: Only Admins can Insert/Update/Delete
-- Note: 'service_role' always has access, but for client-side admin calls we check role or metadata
-- Assuming we use Supabase Auth and have a 'role' in raw_user_meta_data or check a profiles table.
-- For simplicity in this fix, we'll allow 'authenticated' users to update if they are admins.
-- BUT, typically 'postgres' policy checks strict conditions.

-- Let's try a policy that allows ALL authenticated users to update for now to unblock, 
-- or strictly check the custom claim if available. 
-- Safest for Admin Dashboard usage is to rely on the app's logic if we trust the user is authenticated as admin.
-- However, to be secure:

CREATE POLICY "Admin full access" 
ON questions FOR ALL 
TO authenticated 
USING (
    (auth.jwt() ->> 'role') = 'service_role' 
    OR 
    exists (
        select 1 from profiles 
        where id = auth.uid() and role = 'admin'
    )
);

-- Note: The EXISTS query might be expensive if not optimized, but for admin actions it's fine.
-- Make sure 'profiles' table exists and has 'role'.

-- ALternative: Just allow all authenticated for now if profiles table check is tricky
-- CREATE POLICY "All auth update" ON questions FOR ALL TO authenticated USING (true);
