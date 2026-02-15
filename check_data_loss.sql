-- ============================================================
-- 检查被错误清理的题目
-- ============================================================

-- 1. 查找可能被错误清理的题目（包含 ___ 但没有其他内容）
SELECT 
  id,
  type,
  content,
  image_url,
  created_at
FROM questions 
WHERE content ~ '___+'  -- 包含3个或以上连续下划线
  AND LENGTH(TRIM(REGEXP_REPLACE(content, '_+', '', 'g'))) < 50  -- 去掉下划线后内容很少
ORDER BY created_at DESC
LIMIT 20;

-- 2. 统计受影响的题目数量
SELECT 
  COUNT(*) as potentially_affected,
  COUNT(*) FILTER (WHERE image_url IS NOT NULL) as has_image_backup
FROM questions 
WHERE content ~ '___+'
  AND LENGTH(TRIM(REGEXP_REPLACE(content, '_+', '', 'g'))) < 50;

-- 3. 查看是否有原始 LaTeX 格式残留
SELECT 
  id,
  type,
  LEFT(content, 200) as content_preview
FROM questions 
WHERE content LIKE '%\underline%'
   OR content LIKE '%$ %$%'
LIMIT 10;

-- ============================================================
-- 如果有图片备份，可以标记需要重新 OCR
-- ============================================================

-- 创建标记字段
ALTER TABLE questions 
ADD COLUMN IF NOT EXISTS needs_reocr boolean DEFAULT false;

-- 标记需要重新 OCR 的题目
UPDATE questions 
SET needs_reocr = true
WHERE content ~ '___+'
  AND LENGTH(TRIM(REGEXP_REPLACE(content, '_+', '', 'g'))) < 50
  AND image_url IS NOT NULL;

-- 查看标记结果
SELECT COUNT(*) as marked_for_reocr
FROM questions 
WHERE needs_reocr = true;
