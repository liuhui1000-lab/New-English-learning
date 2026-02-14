-- View current settings
SELECT * FROM system_settings;

-- Check for legacy keys
SELECT * FROM system_settings WHERE key IN ('ai_api_key', 'ai_base_url');

-- Check for new config keys
SELECT * FROM system_settings WHERE key LIKE 'ai_config_%';
