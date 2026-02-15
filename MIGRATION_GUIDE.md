# 数据迁移指南：Preview → Production

## 方法 1：使用自动化脚本（推荐）

### Windows 用户
1. 打开 `migrate_questions.ps1`
2. 修改数据库连接信息：
   ```powershell
   $PREVIEW_HOST = "your-preview-db.supabase.co"
   $PREVIEW_PASSWORD = "your-preview-password"
   $PROD_HOST = "your-prod-db.supabase.co"
   $PROD_PASSWORD = "your-prod-password"
   ```
3. 在 PowerShell 中运行：
   ```powershell
   .\migrate_questions.ps1
   ```

### Linux/Mac 用户
1. 打开 `migrate_questions.sh`
2. 修改数据库连接信息
3. 添加执行权限并运行：
   ```bash
   chmod +x migrate_questions.sh
   ./migrate_questions.sh
   ```

## 方法 2：手动迁移（Supabase Dashboard）

### 步骤 1：导出数据

在 **Preview 环境** 的 Supabase SQL Editor 中依次执行：

```sql
-- 1. 导出 source_materials
COPY (SELECT * FROM source_materials ORDER BY created_at) 
TO STDOUT WITH (FORMAT CSV, HEADER true, ENCODING 'UTF8');
```
保存为 `source_materials.csv`

```sql
-- 2. 导出 import_history
COPY (SELECT * FROM import_history ORDER BY import_date) 
TO STDOUT WITH (FORMAT CSV, HEADER true, ENCODING 'UTF8');
```
保存为 `import_history.csv`

```sql
-- 3. 导出 questions (包含 AI 分析)
COPY (SELECT * FROM questions ORDER BY created_at) 
TO STDOUT WITH (FORMAT CSV, HEADER true, ENCODING 'UTF8');
```
保存为 `questions.csv`

### 步骤 2：导入数据

在 **Production 环境** 的 Supabase Table Editor 中：
1. 打开 `source_materials` 表 → Import Data → 上传 `source_materials.csv`
2. 打开 `import_history` 表 → Import Data → 上传 `import_history.csv`
3. 打开 `questions` 表 → Import Data → 上传 `questions.csv`

## 注意事项

⚠️ **迁移前备份**：
```sql
-- 在生产环境执行备份
pg_dump -h <prod-host> -U postgres -d postgres > backup_before_migration.sql
```

⚠️ **UUID 冲突**：
如果生产环境已有数据，可能会有 UUID 冲突。解决方法：
```sql
-- 清空生产环境的题库（谨慎！）
TRUNCATE questions, import_history, source_materials CASCADE;
```

⚠️ **验证迁移结果**：
```sql
-- 检查数据量
SELECT 
  (SELECT COUNT(*) FROM source_materials) as materials,
  (SELECT COUNT(*) FROM import_history) as imports,
  (SELECT COUNT(*) FROM questions) as questions,
  (SELECT COUNT(*) FROM questions WHERE is_ai_analyzed = true) as ai_analyzed;

-- 检查外键完整性
SELECT COUNT(*) FROM questions 
WHERE source_material_id IS NOT NULL 
  AND source_material_id NOT IN (SELECT id FROM source_materials);
```

## 迁移内容清单

✅ 源文档 (`source_materials`)
✅ 导入历史 (`import_history`)
✅ 题库数据 (`questions`)
  - 题目内容 (`content`)
  - 答案 (`answer`)
  - AI 生成的解析 (`explanation`)
  - AI 分析标记 (`is_ai_analyzed`)
  - 标签 (`tags`)
  - 所有元数据

## 不会迁移的数据

❌ 用户数据 (`profiles`, `user_progress`, `quiz_results`)
❌ 系统设置 (`system_settings`)
