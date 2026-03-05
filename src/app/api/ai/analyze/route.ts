import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export const runtime = 'edge'; // Use Edge runtime to bypass Vercel 10s/60s strict timeout

// Simple in-memory cache
let cachedSettings: Record<string, string> | null = null;
let lastFetch = 0;
const CACHE_TTL = 30000; // 30s TTL


export async function POST(request: Request) {
    const cookieStore = await cookies()

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // The `setAll` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing
                        // user sessions.
                    }
                },
            },
        }
    )

    // 1. Check Admin Role
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (!user || authError) {
        console.error("Auth Failed:", authError)
        // Check if cookies exist
        const allCookies = cookieStore.getAll()
        console.error("Cookies present:", allCookies.map(c => c.name).join(', '))
        return NextResponse.json({
            error: 'Unauthorized',
            details: authError?.message || 'No user found',
            cookieCount: allCookies.length,
            cookieNames: allCookies.map(c => c.name)
        }, { status: 401 })
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profile?.role !== 'admin') {
        // Double check via system settings read policy? 
        // Just return 401 for safety
        return NextResponse.json({ error: 'Unauthorized Admin' }, { status: 401 })
    }

    // 2. Get AI Settings (with Cache)
    const now = Date.now();
    let settingsMap: Record<string, string> = {}

    if (cachedSettings && (now - lastFetch < CACHE_TTL)) {
        settingsMap = cachedSettings;
    } else {
        const { data: settingsData } = await supabase
            .from('system_settings')
            .select('key, value')

        if (settingsData) {
            settingsData.forEach((s: any) => settingsMap[s.key] = s.value)
            cachedSettings = settingsMap;
            lastFetch = now;
        }
    }

    // Determine Active Provider
    const activeProvider = settingsMap['ai_provider'] || 'deepseek'
    let apiKey = settingsMap['ai_api_key']
    let baseUrl = settingsMap['ai_base_url']
    let model = settingsMap['ai_model']

    // Try to load from specific config
    const configKey = `ai_config_${activeProvider}`
    if (settingsMap[configKey]) {
        try {
            const config = JSON.parse(settingsMap[configKey])
            if (config.apiKey) apiKey = config.apiKey
            if (config.baseUrl) baseUrl = config.baseUrl
            if (config.model) model = config.model
        } catch (e) {
            console.error("Failed to parse provider config", e)
        }
    }

    if (!apiKey) {
        return NextResponse.json({ error: 'AI API Key not configured' }, { status: 400 })
    }

    // 3. Parse Request Body
    const { items, mode } = await request.json() // items: string[] (questions)

    // 4. Construct Prompt
    const systemPrompt = `You are an expert English teacher for middle school students in Shanghai.
Your task is to analyze the given English questions (Grammar / Vocabulary) and provide metadata.
Return ONLY valid JSON object with a key "results".
Example format:
{
  "results": [
    {
      "index": 0,
      "topic": "...",
      ...
    }
  ]
}

Each object in "results" should have:
- "index": (int) matching input order
- "topic": (string) e.g., "定语从句", "现在完成时", "固定搭配", "词义辨析"
- "difficulty": (int) 1-5
- "key_point": (string) short explanation of the tested point.
- "explanation": (string) Detailed explanation (max 80 words) in Chinese. Explain why the correct answer is right and why other confusing/incorrect options are wrong.
- "answer": (string) The correct answer or completion. For multiple choice, return the letter (e.g. "A"). For fill-in-the-blank, return the word(s).

Input Questions:
`
    const userPrompt = items.map((q: string, i: number) => `${i}. ${q}`).join('\n')

    // 5. Call AI Provider
    try {
        let targetUrl = baseUrl || '';
        // Default URLs if missing
        if (!targetUrl) {
            if (activeProvider === 'deepseek') targetUrl = 'https://api.deepseek.com';
            else if (activeProvider === 'zhipu') targetUrl = 'https://open.bigmodel.cn/api/paas/v4';
            else if (activeProvider === 'openai') targetUrl = 'https://api.openai.com/v1';
        }

        // Ensure URL ends with /v1 or /chat/completions (DeepSeek/OpenAI standard)
        if (!targetUrl.endsWith('/chat/completions')) {
            if (targetUrl.endsWith('/')) targetUrl += 'chat/completions';
            else targetUrl += '/chat/completions';
        }

        const payload = {
            model: model || 'deepseek-chat',
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.1,
            stream: true
        } as any;

        // Force LLM to output valid JSON structure.
        // DeepSeek and OpenAI support this reliably with streaming.
        // GLM (Zhipu) often returns empty streams when this is enabled, so we skip it for GLM.
        if (activeProvider === 'deepseek' || activeProvider === 'openai') {
            payload.response_format = { type: "json_object" };
        }

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                // Send an initial keep-alive comment so the gateway router knows we are active
                controller.enqueue(encoder.encode(": keepalive\n\n"));

                // Pump a keep-alive comment every 15 seconds to prevent 504 Gateway Timeout
                const keepAliveInterval = setInterval(() => {
                    try {
                        controller.enqueue(encoder.encode(": keepalive\n\n"));
                    } catch (e) {
                        clearInterval(keepAliveInterval);
                    }
                }, 15000);

                try {
                    const response = await fetch(targetUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`
                        },
                        body: JSON.stringify(payload)
                    });

                    clearInterval(keepAliveInterval);

                    if (!response.ok) {
                        const err = await response.text();
                        let errorMsg = `Provider API Error: ${response.status} ${err}`;
                        if (response.status === 429) errorMsg = "AI Rate Limit / Quota Exceeded (429). Please slow down.";
                        else if (response.status === 401) errorMsg = `Invalid AI API Key (401) for provider: ${activeProvider}. Check Settings.`;
                        else if (response.status >= 500) errorMsg = "AI Provider Server Error (5xx). Try changing model.";

                        // We already started the 200 OK stream, so we must send a custom error payload
                        controller.enqueue(encoder.encode(`data: {"error": ${JSON.stringify(errorMsg)}}\n\n`));
                        controller.close();
                        return;
                    }

                    if (response.body) {
                        const reader = response.body.getReader();
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            controller.enqueue(value);
                        }
                    }
                    controller.close();
                } catch (e: any) {
                    clearInterval(keepAliveInterval);
                    controller.enqueue(encoder.encode(`data: {"error": ${JSON.stringify(e.message)}}\n\n`));
                    controller.close();
                }
            }
        });

        // Return the stream directly to the client
        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });
    } catch (e: any) {
        console.error("AI Analyze Error:", e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
