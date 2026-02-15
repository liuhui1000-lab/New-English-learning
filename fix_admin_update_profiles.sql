-- FIX: Allow admin to update other users' profiles (e.g. approve pending users)
-- Root Cause: The existing RLS policy "Users can update own profile" only allows
-- auth.uid() = id, so admin cannot change another user's status.

-- 1. Drop the restrictive update policy
DROP POLICY IF EXISTS "Users can update own profile." ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- 2. Create new policies: users can update own, admins can update anyone
CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can update any profile"
ON profiles FOR UPDATE
TO authenticated
USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
)
WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- 3. Grant UPDATE permission on profiles to authenticated users
GRANT UPDATE ON profiles TO authenticated;

-- 4. Reload config
NOTIFY pgrst, 'reload config';
