const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Parsers .env file manually
function parseEnv(filePath) {
    if (!fs.existsSync(filePath)) return {};
    const content = fs.readFileSync(filePath, 'utf-8');
    const env = {};
    content.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            env[match[1].trim()] = match[2].trim().replace(/^"(.*)"$/, '$1');
        }
    });
    return env;
}

const env = parseEnv('.env.local');
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
// Using Service Role key if available to bypass RLS, otherwise anon
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey;

console.log('Connecting to:', supabaseUrl);

const supabase = createClient(supabaseUrl, serviceKey);

async function inspectSettings() {
    // Also log which token we would use in API logic
    const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .or('key.eq.ocr_token,key.eq.ocr_url,key.eq.paddle_ocr_token,key.eq.baidu_ocr_api_key,key.eq.ocr_provider,key.like.ocr_config_%');

    if (error) {
        console.error('Error fetching settings:', error);
    } else {
        console.log('OCR Settings found:', JSON.stringify(data, null, 2));
    }
}

inspectSettings();
