const { createClient } = require('@supabase/supabase-js');

async function testFetch() {
    // 1. Login to get a valid session
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || 'YOUR_SUPABASE_URL',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY'
    );

    console.log("Logging in as demo student...");
    const { data: authData, error: loginError } = await supabase.auth.signInWithPassword({
        email: process.env.TEST_USER_EMAIL || 'test@example.com',
        password: process.env.TEST_USER_PASSWORD || 'YOUR_TEST_PASSWORD'
    });

    if (loginError) {
        console.error("Login failed, cannot test route organically without token:", loginError.message);
        return;
    }

    const token = authData.session.access_token;
    console.log("Logged in. Fetching /api/ai/analyze-errors...");

    // 2. Fetch API with Auth Header
    try {
        const response = await fetch('http://localhost:3000/api/ai/analyze-errors?userId=6b2b6149-833e-4801-8815-71395587bd51', {
            headers: {
                'Cookie': `sb-ovhktkslvvskscsyzrvf-auth-token=${JSON.stringify(authData.session)}`
            }
        });
        const text = await response.text();
        console.log("Status:", response.status);
        try {
            console.log("Result:", JSON.parse(text));
        } catch (e) {
            console.log("Raw Text:", text.substring(0, 500));
        }
    } catch (e) {
        console.error("Fetch failed:", e);
    }
}

testFetch();
