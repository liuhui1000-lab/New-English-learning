# ============================================================
# Windows PowerShell 版本 - 数据迁移脚本
# ============================================================
# 使用方法：
# 1. 修改下面的数据库连接信息
# 2. 在 PowerShell 中运行: .\migrate_questions.ps1
# ============================================================

# 配置数据库连接信息
$PREVIEW_HOST = "your-preview-db.supabase.co"
$PREVIEW_DB = "postgres"
$PREVIEW_USER = "postgres"
$PREVIEW_PASSWORD = "your-preview-password"

$PROD_HOST = "your-prod-db.supabase.co"
$PROD_DB = "postgres"
$PROD_USER = "postgres"
$PROD_PASSWORD = "your-prod-password"

# 导出目录
$EXPORT_DIR = ".\migration_export"
New-Item -ItemType Directory -Force -Path $EXPORT_DIR | Out-Null

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "开始导出 Preview 环境数据..." -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# 设置环境变量
$env:PGPASSWORD = $PREVIEW_PASSWORD

# 1. 导出 source_materials
Write-Host "[1/3] 导出 source_materials..." -ForegroundColor Yellow
pg_dump -h $PREVIEW_HOST -U $PREVIEW_USER -d $PREVIEW_DB `
    -t source_materials --data-only --column-inserts `
    -f "$EXPORT_DIR\01_source_materials.sql"

# 2. 导出 import_history
Write-Host "[2/3] 导出 import_history..." -ForegroundColor Yellow
pg_dump -h $PREVIEW_HOST -U $PREVIEW_USER -d $PREVIEW_DB `
    -t import_history --data-only --column-inserts `
    -f "$EXPORT_DIR\02_import_history.sql"

# 3. 导出 questions
Write-Host "[3/3] 导出 questions (包含 AI 分析)..." -ForegroundColor Yellow
pg_dump -h $PREVIEW_HOST -U $PREVIEW_USER -d $PREVIEW_DB `
    -t questions --data-only --column-inserts `
    -f "$EXPORT_DIR\03_questions.sql"

Write-Host ""
Write-Host "=========================================" -ForegroundColor Green
Write-Host "导出完成！文件保存在: $EXPORT_DIR" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""

# 确认导入
$confirmation = Read-Host "准备导入到生产环境，确认继续？(y/n)"
if ($confirmation -ne 'y') {
    Write-Host "已取消导入" -ForegroundColor Red
    exit
}

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "开始导入到 Production 环境..." -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# 切换到生产环境密码
$env:PGPASSWORD = $PROD_PASSWORD

# 按顺序导入
Write-Host "[1/3] 导入 source_materials..." -ForegroundColor Yellow
psql -h $PROD_HOST -U $PROD_USER -d $PROD_DB -f "$EXPORT_DIR\01_source_materials.sql"

Write-Host "[2/3] 导入 import_history..." -ForegroundColor Yellow
psql -h $PROD_HOST -U $PROD_USER -d $PROD_DB -f "$EXPORT_DIR\02_import_history.sql"

Write-Host "[3/3] 导入 questions..." -ForegroundColor Yellow
psql -h $PROD_HOST -U $PROD_USER -d $PROD_DB -f "$EXPORT_DIR\03_questions.sql"

Write-Host ""
Write-Host "=========================================" -ForegroundColor Green
Write-Host "迁移完成！" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""

# 验证数据
Write-Host "验证数据..." -ForegroundColor Yellow
psql -h $PROD_HOST -U $PROD_USER -d $PROD_DB -c @"
SELECT 
  (SELECT COUNT(*) FROM source_materials) as source_materials_count,
  (SELECT COUNT(*) FROM import_history) as import_history_count,
  (SELECT COUNT(*) FROM questions) as questions_count,
  (SELECT COUNT(*) FROM questions WHERE is_ai_analyzed = true) as ai_analyzed_count;
"@

# 清理环境变量
Remove-Item Env:\PGPASSWORD
