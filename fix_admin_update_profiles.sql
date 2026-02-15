-- ============================================================
-- 修复：Admin 无法查看用户列表 (无限递归问题)
-- ============================================================
-- 本脚本会先删除所有现有策略，然后重新创建
-- 可以安全地重复执行

-- Step 1: 创建绕过 RLS 的权限检查函数
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER -- 关键：以定义者权限运行，绕过 RLS
SET search_path = public -- 安全最佳实践
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  );
$$;

-- Step 2: 删除所有现有策略（避免冲突）
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'profiles') 
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON profiles';
    END LOOP;
END $$;

-- Step 3: 确保 RLS 已启用
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 重新定义策略 (使用 is_admin() 函数避免递归)
-- ============================================================

-- 1. SELECT: 普通用户看自己，Admin 看所有
CREATE POLICY "Users can view own profile or admins view all"
ON profiles FOR SELECT
TO authenticated
USING (
    auth.uid() = id  -- 普通用户看自己
    OR
    public.is_admin() -- Admin 看所有 (使用函数避免递归)
);

-- 2. INSERT: 用户只能插入自己的 profile
CREATE POLICY "Users can insert own profile"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- 3. UPDATE: 用户改自己，Admin 改所有
CREATE POLICY "Users can update own profile or admins update all"
ON profiles FOR UPDATE
TO authenticated
USING (
    auth.uid() = id
    OR
    public.is_admin()
)
WITH CHECK (
    auth.uid() = id
    OR
    public.is_admin()
);

-- 4. DELETE: 仅 Admin 可删除
CREATE POLICY "Admins can delete profiles"
ON profiles FOR DELETE
TO authenticated
USING (public.is_admin());

-- ============================================================
-- Step 4: 授予权限
-- ============================================================
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON profiles TO authenticated;

-- Step 5: 刷新配置
NOTIFY pgrst, 'reload config';

-- ============================================================
-- 验证：查看当前策略
-- ============================================================
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies 
WHERE tablename = 'profiles'
ORDER BY policyname;
