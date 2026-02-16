-- ============================================================
-- 简化版数据检查
-- ============================================================

-- 查询 1: 检查是否还有 LaTeX 格式未清理
SELECT COUNT(*) as remaining_latex
FROM questions 
WHERE content LIKE '%\underline%' 
   OR content LIKE '%$ %$%';

-- 查询 2: 查看最近的题目内容（确认清理效果）
SELECT 
  id,
  type,
  LEFT(content, 200) as content_sample
FROM questions 
ORDER BY created_at DESC
LIMIT 5;

-- 查询 3: 检查是否有异常的下划线（3个或更少）
SELECT COUNT(*) as unusual_underlines
FROM questions 
WHERE content ~ '_{3}[^_]';  -- 恰好3个下划线后面不是下划线

-- 查询 4: 查看包含 HTML 下划线标签的题目数量
SELECT COUNT(*) as html_underlines
FROM questions 
WHERE content LIKE '%<u>%';
