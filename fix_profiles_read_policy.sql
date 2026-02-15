-- FIX: Ensure 'profiles' table is readable so RLS checks can work

-- 1. Ensure Profiles are Readable
-- If this policy is missing, the "Am I Admin?" check will fail silently (return null)
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Authenticated can read all profiles" ON profiles;

CREATE POLICY "Authenticated can read all profiles" 
ON profiles FOR SELECT 
TO authenticated 
USING (true);

-- 2. Verify System Settings Policy (Re-apply to be sure)
DROP POLICY IF EXISTS "Admins can manage system settings" ON system_settings;

CREATE POLICY "Admins can manage system settings" 
ON system_settings 
FOR ALL 
TO authenticated 
USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
)
WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- 3. Explicit Grants (Crucial for Permission Denied errors)
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON system_settings TO authenticated;
GRANT SELECT ON profiles TO authenticated;

-- 4. Reload Config
NOTIFY pgrst, 'reload config';
