const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Try to read .env.local
let envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
}

async function run() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error("Missing Supabase credentials in .env.local");
        return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
        .from('system_settings')
        .select('*');

    if (error) {
        console.error("Error fetching settings:", error);
        return;
    }

    console.log("--- OCR Settings ---");
    data.filter(s => s.key.toLowerCase().includes('ocr')).forEach(s => {
        console.log(`${s.key}: ${s.value}`);
    });
}

run();
