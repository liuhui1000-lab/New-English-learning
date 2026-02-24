const { createClient } = require('@supabase/supabase-js');

async function testFetch() {
    // 1. Login to get a valid session
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ovhktkslvvskscsyzrvf.supabase.co',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
    );

    console.log("Logging in as demo student...");
    const { data: authData, error: loginError } = await supabase.auth.signInWithPassword({
        email: 'test@example.com', // Need actual test creds, but we can bypass locally using a crafted token if needed
        password: 'password123'
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
