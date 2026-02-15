-- ============================================================
-- 修复：Admin 无法查看用户列表 (无限递归问题)
-- ============================================================
-- 问题根源：
-- 之前定义的 "Admins can read all profiles" 策略中包含了一个子查询：
-- (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
-- 当 Admin 尝试访问 profiles 表时，这个子查询会再次触发 profiles 表的 SELECT 策略，导致无限递归。
-- PostgreSQL 检测到无限递归后，会自动中断查询或返回空结果，导致 Admin 看不到任何数据。

-- 解决方案：
-- 使用一个 "SECURITY DEFINER" 函数来检查 Admin 权限。
-- SECURITY DEFINER 函数会以定义者（通常是超级用户或表所有者）的权限运行，从而绕过 RLS 检查，避免递归。

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

-- Step 2: 清理旧策略
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Authenticated can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile." ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile or admins view all" ON profiles;

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
