-- Create system_settings table for global configuration
CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Policies: Only Admins can Read/Write
-- Assuming 'profiles' table has 'role' column.
CREATE POLICY "Admins can manage system settings" 
ON system_settings 
FOR ALL 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'admin'
    )
);

-- Insert Default Settings (Empty placeholders)
INSERT INTO system_settings (key, value, description)
VALUES 
    ('ai_provider', 'deepseek', 'Selected AI Provider (deepseek, zhipu, openai)'),
    ('ai_api_key', '', 'API Key for the selected provider'),
    ('ai_base_url', 'https://api.deepseek.com', 'Base URL for API calls'),
    ('ai_model', 'deepseek-chat', 'Model name to use')
ON CONFLICT (key) DO NOTHING;
