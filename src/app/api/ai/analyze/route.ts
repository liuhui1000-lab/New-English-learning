import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

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

    // 2. Get AI Settings
    const { data: settingsData } = await supabase
        .from('system_settings')
        .select('key, value')

    const settingsMap: Record<string, string> = {}
    if (settingsData) {
        settingsData.forEach((s: any) => settingsMap[s.key] = s.value)
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
- "explanation": (string) DETAILED explanation of why the answer is correct and why others are wrong. (IN CHINESE)
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
            response_format: { type: "json_object" }
        }

        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(payload)
        })

        if (!response.ok) {
            const err = await response.text()

            // Forward specific error code to client
            if (response.status === 429) {
                return NextResponse.json({ error: "AI Rate Limit / Quota Exceeded (429). Please slow down." }, { status: 429 })
            }
            if (response.status === 401) {
                return NextResponse.json({ error: `Invalid AI API Key (401) for provider: ${activeProvider}. Check Settings.` }, { status: 401 })
            }
            if (response.status >= 500) {
                return NextResponse.json({ error: "AI Provider Server Error (5xx). Try changing model." }, { status: 502 })
            }

            throw new Error(`Provider API Error: ${response.status} ${err}`)
        }

        const aiData = await response.json()
        const content = aiData.choices[0].message.content

        // 6. Parse JSON from AI content
        console.log("AI Raw Output:", content)

        // Find the first '[' and the last ']' to extract the JSON array
        const jsonMatch = content.match(/\[[\s\S]*\]/)
        if (!jsonMatch) {
            throw new Error("No JSON array found in AI response")
        }

        const jsonStr = jsonMatch[0]

        let parsedResults
        try {
            parsedResults = JSON.parse(jsonStr)
        } catch (e: any) {
            console.error("JSON Parse Fail:", e)
            // Try to cleanup common issues like trailing commas if needed, 
            // but for now just fail with better error
            throw new Error(`JSON Syntax Error: ${e.message}`)
        }

        return NextResponse.json({ results: parsedResults })

    } catch (e: any) {
        console.error("AI Analyze Error:", e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
