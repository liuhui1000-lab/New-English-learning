-- ============================================================
-- 清理 OCR 识别错误 - LaTeX 下划线
-- ============================================================
-- 用途：批量清理已导入题目中的 LaTeX 下划线误识别
-- 执行环境：生产环境 Supabase SQL Editor
-- ============================================================

-- 1. 查看受影响的题目数量
SELECT COUNT(*) as affected_count
FROM questions 
WHERE content LIKE '%\underline%' 
   OR content LIKE '%$ %$%';

-- 2. 预览将要修改的题目（前 10 条）
SELECT 
  id,
  type,
  LEFT(content, 100) as content_preview,
  LEFT(
    regexp_replace(
      regexp_replace(content, '\$\s*\\underline\{\\text\{\}\}\s*\$', '____', 'g'),
      '\$\s*\\text\{([^}]*)\}\s*\$', '\1', 'g'
    ),
    100
  ) as cleaned_preview
FROM questions 
WHERE content LIKE '%\underline%' 
   OR content LIKE '%$ %$%'
LIMIT 10;

-- 3. 执行清理（请先确认上面的预览结果）
UPDATE questions 
SET content = regexp_replace(
  regexp_replace(
    regexp_replace(
      regexp_replace(
        content,
        -- 清理 LaTeX 下划线（带或不带内容）: $ \underline{\text{...}} $ → ____
        '\$\s*\\underline\{\\text\{[^}]*\}\}\s*\$', '____', 'g'
      ),
      -- 清理 LaTeX 文本包装: $ \text{content} $ → content
      '\$\s*\\text\{([^}]*)\}\s*\$', '\1', 'g'
    ),
    -- 清理多余空格
    '\s{2,}', ' ', 'g'
  ),
  -- 规范化下划线（5个以上统一为4个）
  '_{5,}', '____', 'g'
)
WHERE content LIKE '%\underline%' 
   OR content LIKE '%$ %$%'
   OR content ~ '_{5,}';

-- 4. 验证清理结果
SELECT 
  COUNT(*) as remaining_latex_count
FROM questions 
WHERE content LIKE '%\underline%';

-- 5. 查看清理后的题目示例
SELECT 
  id,
  type,
  LEFT(content, 150) as cleaned_content
FROM questions 
WHERE updated_at > NOW() - INTERVAL '5 minutes'
LIMIT 10;
