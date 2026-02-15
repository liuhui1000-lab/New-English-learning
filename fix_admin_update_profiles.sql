-- ============================================================
-- 综合权限设计：profiles 表 RLS 策略
-- ============================================================
-- 设计原则：
--   1. Admin 可以查看、修改所有用户的 profile（批准、冻结、解冻等）
--   2. 普通用户只能查看所有人的 profile，但只能修改自己的 profile
--   3. 密码重置：
--      - 普通用户通过 Supabase Auth 的 updateUser() 修改自己的密码（前端直接调用）
--      - Admin 通过服务端 API (/api/admin/reset-password) 使用 service_role 密钥重置任意用户密码
-- ============================================================

-- Step 1: 清理旧策略（避免冲突）
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Authenticated can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile." ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;

-- Step 2: 确保 RLS 已启用
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SELECT：所有已认证用户可以查看所有 profile
-- （必须允许，否则 admin 角色检查的子查询会失败）
-- ============================================================
CREATE POLICY "Authenticated can read all profiles"
ON profiles FOR SELECT
TO authenticated
USING (true);

-- ============================================================
-- INSERT：用户只能插入自己的 profile（由 trigger 自动调用）
-- ============================================================
CREATE POLICY "Users can insert own profile"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- ============================================================
-- UPDATE：分两条策略
-- ============================================================

-- 策略 A：普通用户只能修改自己的 profile
CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 策略 B：Admin 可以修改任何人的 profile（批准/冻结/解冻）
CREATE POLICY "Admins can update any profile"
ON profiles FOR UPDATE
TO authenticated
USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
)
WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- ============================================================
-- DELETE：仅 Admin 可以删除用户（可选，当前未使用）
-- ============================================================
CREATE POLICY "Admins can delete profiles"
ON profiles FOR DELETE
TO authenticated
USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- ============================================================
-- Step 3: 授予必要的表级权限
-- ============================================================
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON profiles TO authenticated;
GRANT DELETE ON profiles TO authenticated;  -- Admin 删除用户时需要

-- Step 4: 刷新 PostgREST 缓存
NOTIFY pgrst, 'reload config';

-- ============================================================
-- 验证：执行后可运行以下查询检查策略是否生效
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies WHERE tablename = 'profiles';
-- ============================================================
