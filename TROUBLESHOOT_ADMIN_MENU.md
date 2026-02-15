# 管理员菜单不显示 - 排查清单

## 问题现象
管理员登录后，左侧菜单只显示：
- 学习中心
- 个人中心  
- 退出登录

缺少的管理员功能：
- 快速导入
- 内容题库
- 用户管理
- 系统设置

## 根本原因
前端代码通过查询 `profiles` 表的 `role` 字段来判断是否为管理员。如果查询失败或返回空，`isAdmin` 会被设为 `false`，导致管理员菜单被隐藏。

## 排查步骤

### 1. 确认 SQL 脚本是否已执行 ⚠️
**这是最可能的原因！**

请在 **Supabase Dashboard → SQL Editor** 中执行：
```
fix_admin_update_profiles.sql
```

该脚本会：
- 创建 `public.is_admin()` 函数（绕过 RLS 递归）
- 更新 profiles 表的 RLS 策略
- 允许用户查询自己的 profile（包括 role 字段）

### 2. 检查浏览器控制台
打开浏览器控制台（F12 → Console），刷新页面，查看输出：

**正常情况应该看到：**
```
Current user: <your-uuid>
Profile data: { role: 'admin' }
Profile error: null
Is admin: true
```

**如果 RLS 阻止查询，会看到：**
```
Current user: <your-uuid>
Profile data: null
Profile error: { code: '42501', message: 'new row violates row-level security policy' }
Is admin: false
```

### 3. 确认数据库中的 role 值
在 Supabase → Table Editor → profiles 表中，找到您的用户记录，确认：
- `role` 字段 = `'admin'`（不是 `'student'`）

### 4. 清除浏览器缓存
有时旧的 RLS 策略会被缓存，尝试：
- 硬刷新：Ctrl + Shift + R（Windows）
- 或清除浏览器缓存后重新登录

## 快速修复
如果执行 SQL 脚本后仍有问题，临时方案是直接在代码中设置：

```tsx
// 临时：强制显示管理员菜单（仅用于调试）
const [isAdmin, setIsAdmin] = useState(true)
```

但这**不安全**，只用于确认前端逻辑正常。正式环境必须依赖数据库权限控制。
