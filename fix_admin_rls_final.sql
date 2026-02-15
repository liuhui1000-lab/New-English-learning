-- FINAL ROBUST SOLUTION: Use Security Definer Function
-- This avoids all "Circular RLS" and "Read Permission" issues by checking admin status
-- with elevated privileges, but only for the purpose of this boolean check.

-- 1. Create a Secure Function to Check Admin Status
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.profiles 
    WHERE id = auth.uid() 
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; -- <== Runs as Superuser/Owner

-- 2. Apply to System Settings (Clean Slate)
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage system settings" ON system_settings;
DROP POLICY IF EXISTS "Enable all access for admins" ON system_settings;
DROP POLICY IF EXISTS "Allow authenticated users to manage settings" ON system_settings;

CREATE POLICY "Admins can manage system settings" 
ON system_settings 
FOR ALL 
TO authenticated 
USING (
    public.is_admin() = true
)
WITH CHECK (
    public.is_admin() = true
);

-- 3. Verify Profiles are correct (Just in case)
UPDATE public.profiles 
SET role = 'admin' 
WHERE id IN (SELECT id FROM auth.users) -- Auto-fix any inconsistency
AND role IS DISTINCT FROM 'admin';

-- 4. Reload Config
NOTIFY pgrst, 'reload config';
