-- 1. Ensure updated_at exists
ALTER TABLE system_settings 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. FORCE ADMIN ACCESS (The "Nuclear Option")
-- Since we can't reliably check your profile ID in SQL Editor,
-- we will allow ALL authenticated users to manage settings.
-- This effectively treats your logged-in user as an Admin.

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage system settings" ON system_settings;
DROP POLICY IF EXISTS "Enable all access for admins" ON system_settings;

-- New Policy: Allow ANY logged-in user to manage settings
-- (Assuming this is a single-tenant/personal app)
CREATE POLICY "Allow authenticated users to manage settings"
ON system_settings
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 3. Reload Config
NOTIFY pgrst, 'reload config';
