const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Try to read .env.local
let envPath = path.join(process.cwd(), '.env.local');
// Manual override for common vars if .env.local is missing
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ovhktkslvvskscsyzrvf.supabase.co"; // Example fallback if I can find it
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function run() {
    if (!supabaseUrl || !supabaseKey) {
        console.error("Missing Supabase credentials");
        return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("Checking error_analysis_reports table...");
    const { data, count, error } = await supabase
        .from('error_analysis_reports')
        .select('*', { count: 'exact' });

    if (error) {
        console.error("Error fetching reports:", error);
        return;
    }

    console.log(`Total reports found: ${count}`);
    if (data && data.length > 0) {
        console.log("Latest report summary:");
        const latest = data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        console.log(`ID: ${latest.id}`);
        console.log(`User ID: ${latest.user_id}`);
        console.log(`Content length: ${latest.report_content?.length || 0}`);
        console.log(`Created At: ${latest.created_at}`);
        console.log("Content start:", latest.report_content?.substring(0, 100));
    }
}

run();
