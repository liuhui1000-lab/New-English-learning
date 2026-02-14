const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Missing Supabase environment variables.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
    const sqlPath = path.join(__dirname, 'init_quiz_results.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Supabase JS client doesn't support raw SQL execution directly on the client side usually,
    // BUT we can use the rpc() method if we have a function, OR we can use the HTTP API directly.
    // However, for schema changes, we usually need the SERVICE ROLE KEY or use the dashboard.
    // Since we are in a dev environment acting as the developer, we might not have the service role key readily available in .env.local if it's only anon.

    // Wait, the user has been running SQL via some method?
    // Previous logs showed `Invoke-WebRequest` failure.
    // Actually, the best way for the user to run this is via the Supabase Dashboard SQL Editor.

    // Alternative: We can try to use the `pg` library if we have the connection string.
    // But we likely don't.

    // Let's try to output the SQL and ask the user to run it?
    // OR, if we have a `postgres` connection string in .env, use that.

    // Checking .env file availability...
    console.log("SQL Content to be run (Quiz Results + System Settings):");
    console.log("---------------------------------------------------");
    console.log(sql);
    console.log("\n-- Create system_settings table for global configuration");
    console.log("CREATE TABLE IF NOT EXISTS system_settings (");
    console.log("    key TEXT PRIMARY KEY,");
    console.log("    value TEXT NOT NULL,");
    console.log("    description TEXT,");
    console.log("    updated_at TIMESTAMPTZ DEFAULT NOW(),");
    console.log("    updated_by UUID REFERENCES auth.users(id)");
    console.log(");");
    console.log("ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;");
    console.log("CREATE POLICY \"Admins can manage system settings\" ON system_settings FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));");
    console.log("INSERT INTO system_settings (key, value, description) VALUES ('ai_provider', 'deepseek', 'AI Provider'), ('ai_api_key', '', 'API Key') ON CONFLICT (key) DO NOTHING;");
    console.log("---------------------------------------------------");
    console.log("\nPlease copy the above SQL and run it in your Supabase Dashboard -> SQL Editor.");
}

runMigration();
