-- 1. Sync Missing Profiles
-- (If you signed up before the trigger was created, you might have a User but no Profile)
INSERT INTO public.profiles (id, username, role, status)
SELECT 
    id, 
    COALESCE(raw_user_meta_data->>'full_name', email) as username, 
    'admin' as role, 
    'active' as status
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles);

-- 2. Force Admin Role for ALL existing profiles
-- (Ensures your user is definitely an admin in the database)
UPDATE public.profiles 
SET role = 'admin', status = 'active';

-- 3. Restore Strict RLS Policy (The "Correct Logic")
-- Revert to the secure check that requires 'admin' role
DROP POLICY IF EXISTS "Admins can manage system settings" ON system_settings;
DROP POLICY IF EXISTS "Enable all access for admins" ON system_settings;
DROP POLICY IF EXISTS "Allow authenticated users to manage settings" ON system_settings; -- Drop the temporary fix

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

-- 4. Verify Result
SELECT * FROM public.profiles;
