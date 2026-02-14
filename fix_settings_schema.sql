-- Fix missing columns in system_settings table
ALTER TABLE system_settings 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE system_settings 
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);

-- Refresh PostgREST schema cache (usually happens automatically on DDL, but good to know)
NOTIFY pgrst, 'reload config';
