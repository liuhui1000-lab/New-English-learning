-- ============================================
-- 最终修复: system_settings RLS 策略
-- 使用 SECURITY DEFINER 函数绕过 profiles RLS
-- ============================================

-- 1. 创建 is_admin() 函数 (SECURITY DEFINER = 以创建者权限执行，可绕过 RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- 2. 删除所有旧的 system_settings 策略
DROP POLICY IF EXISTS "Admins can manage system settings" ON system_settings;
DROP POLICY IF EXISTS "Enable all access for admins" ON system_settings;
DROP POLICY IF EXISTS "Allow authenticated users to manage settings" ON system_settings;
DROP POLICY IF EXISTS "Anyone can read settings" ON system_settings;

-- 3. 确保 RLS 已启用
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- 4. 创建新策略: 使用 is_admin() 函数
CREATE POLICY "Admins can manage system settings"
ON system_settings
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 5. 确保 profiles 表允许用户读取自己的记录
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile"
ON profiles FOR SELECT
TO authenticated
USING (id = auth.uid());

-- 6. 确保 updated_at 列存在
ALTER TABLE system_settings 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 7. 刷新缓存
NOTIFY pgrst, 'reload config';

-- 完成! 现在 admin 用户可以正常读写 system_settings 了
