-- ============================================================
-- 查找包含 HTML 下划线的题目
-- ============================================================

-- 查看所有包含 <u> 标签的题目详情
SELECT 
  id,
  type,
  content,
  created_at
FROM questions 
WHERE content LIKE '%<u>%'
ORDER BY created_at DESC;

-- 如果想在题库管理页面快速找到这些题目，可以复制这些 ID
SELECT 
  STRING_AGG(id::text, ', ') as question_ids
FROM questions 
WHERE content LIKE '%<u>%';
