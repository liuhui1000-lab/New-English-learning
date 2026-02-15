-- DEBUG SCRIPT: Diagnose RLS and User Data Status

-- 1. Check Active Policies on system_settings
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'system_settings';

-- 2. Check User vs Profile consistency
SELECT 
    (SELECT count(*) FROM auth.users) as auth_users_count,
    (SELECT count(*) FROM public.profiles) as profiles_count,
    (SELECT count(*) FROM public.profiles WHERE role = 'admin') as admin_profiles_count;

-- 3. Show ANY profile data (to see if role is correct)
-- Limit 5 to avoid privacy leak if this were prod, but fine for dev
SELECT id, username, role, status FROM public.profiles LIMIT 5;

-- 4. Check if 'system_settings' table structure is correct
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'system_settings';
