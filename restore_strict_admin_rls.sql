-- 1. RE-ENABLE Strict Security
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- 2. GRANT Necessary Permissions (The missing link from before)
-- Users need to READ the profiles table to verify they are admins!
DROP POLICY IF EXISTS "Authenticated can read all profiles" ON profiles;
CREATE POLICY "Authenticated can read all profiles" 
ON profiles FOR SELECT 
TO authenticated 
USING (true);

-- 3. RESTORE Admin-Only Write Policy
DROP POLICY IF EXISTS "Admins can manage system settings" ON system_settings;
DROP POLICY IF EXISTS "Allow authenticated users to manage settings" ON system_settings; -- Remove the temporary loose policy

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

-- 4. Reload Config
NOTIFY pgrst, 'reload config';
