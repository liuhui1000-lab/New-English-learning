#!/bin/bash
# ============================================================
# 数据迁移脚本：Preview → Production
# ============================================================
# 迁移内容：
# 1. source_materials (源文档)
# 2. import_history (导入历史)
# 3. questions (题库 + AI 分析结果)
# ============================================================

# 配置数据库连接信息
PREVIEW_HOST="your-preview-db.supabase.co"
PREVIEW_DB="postgres"
PREVIEW_USER="postgres"
PREVIEW_PASSWORD="your-preview-password"

PROD_HOST="your-prod-db.supabase.co"
PROD_DB="postgres"
PROD_USER="postgres"
PROD_PASSWORD="your-prod-password"

# 导出目录
EXPORT_DIR="./migration_export"
mkdir -p $EXPORT_DIR

echo "========================================="
echo "开始导出 Preview 环境数据..."
echo "========================================="

# 1. 导出 source_materials
echo "[1/3] 导出 source_materials..."
PGPASSWORD=$PREVIEW_PASSWORD pg_dump \
  -h $PREVIEW_HOST \
  -U $PREVIEW_USER \
  -d $PREVIEW_DB \
  -t source_materials \
  --data-only \
  --column-inserts \
  > $EXPORT_DIR/01_source_materials.sql

# 2. 导出 import_history
echo "[2/3] 导出 import_history..."
PGPASSWORD=$PREVIEW_PASSWORD pg_dump \
  -h $PREVIEW_HOST \
  -U $PREVIEW_USER \
  -d $PREVIEW_DB \
  -t import_history \
  --data-only \
  --column-inserts \
  > $EXPORT_DIR/02_import_history.sql

# 3. 导出 questions (包含 AI 分析结果)
echo "[3/3] 导出 questions (包含 AI 分析)..."
PGPASSWORD=$PREVIEW_PASSWORD pg_dump \
  -h $PREVIEW_HOST \
  -U $PREVIEW_USER \
  -d $PREVIEW_DB \
  -t questions \
  --data-only \
  --column-inserts \
  > $EXPORT_DIR/03_questions.sql

echo ""
echo "========================================="
echo "导出完成！文件保存在: $EXPORT_DIR"
echo "========================================="
echo ""
echo "准备导入到生产环境..."
read -p "确认继续？(y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "已取消导入"
    exit 0
fi

echo "========================================="
echo "开始导入到 Production 环境..."
echo "========================================="

# 按顺序导入（保持外键依赖关系）
echo "[1/3] 导入 source_materials..."
PGPASSWORD=$PROD_PASSWORD psql \
  -h $PROD_HOST \
  -U $PROD_USER \
  -d $PROD_DB \
  -f $EXPORT_DIR/01_source_materials.sql

echo "[2/3] 导入 import_history..."
PGPASSWORD=$PROD_PASSWORD psql \
  -h $PROD_HOST \
  -U $PROD_USER \
  -d $PROD_DB \
  -f $EXPORT_DIR/02_import_history.sql

echo "[3/3] 导入 questions..."
PGPASSWORD=$PROD_PASSWORD psql \
  -h $PROD_HOST \
  -U $PROD_USER \
  -d $PROD_DB \
  -f $EXPORT_DIR/03_questions.sql

echo ""
echo "========================================="
echo "迁移完成！"
echo "========================================="
echo ""
echo "验证数据："
PGPASSWORD=$PROD_PASSWORD psql \
  -h $PROD_HOST \
  -U $PROD_USER \
  -d $PROD_DB \
  -c "SELECT 
    (SELECT COUNT(*) FROM source_materials) as source_materials_count,
    (SELECT COUNT(*) FROM import_history) as import_history_count,
    (SELECT COUNT(*) FROM questions) as questions_count,
    (SELECT COUNT(*) FROM questions WHERE is_ai_analyzed = true) as ai_analyzed_count;"
