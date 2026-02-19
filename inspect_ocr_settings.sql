SELECT key, value, created_at, updated_at 
FROM system_settings 
WHERE key IN ('ocr_token', 'ocr_url', 'paddle_ocr_token', 'baidu_ocr_api_key', 'ocr_provider') 
   OR key LIKE 'ocr_config_%';
