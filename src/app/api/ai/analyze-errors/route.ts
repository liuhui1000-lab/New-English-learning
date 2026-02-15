
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
                        // Ignored
                    }
                },
            },
        }
    )

    // 1. Check Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (!user || authError) return NextResponse.json({ error: 'Unauthorized', details: authError?.message }, { status: 401 })

    // 2. Get AI Settings
    const { data: settingsData } = await supabase
        .from('system_settings')
        .select('key, value')

    const settingsMap: Record<string, string> = {}
    if (settingsData) {
        settingsData.forEach((s: any) => settingsMap[s.key] = s.value)
    }

    const activeProvider = settingsMap['ai_provider'] || 'deepseek'
    let apiKey = ''
    let baseUrl = ''
    let model = ''

    const configKey = `ai_config_${activeProvider}`
    if (settingsMap[configKey]) {
        try {
            const config = JSON.parse(settingsMap[configKey])
            apiKey = config.apiKey
            baseUrl = config.baseUrl
            model = config.model
        } catch (e) {
            console.error("Failed to parse provider config", e)
        }
    }

    if (!apiKey) {
        return NextResponse.json({ error: 'AI API Key not configured' }, { status: 400 })
    }

    // 3. Parse Request
    const { mistakes } = await request.json()
    // mistakes: { content, type, userStatus, count, note }[]

    if (!mistakes || mistakes.length === 0) {
        return NextResponse.json({ report: "没有足够的错题数据进行分析。" })
    }

    // 4. Construct Prompt
    const systemPrompt = `You are an expert English teacher for middle school students in Shanghai.
Your task is to analyze the student's recent mistakes and provide a diagnostic report.
The report should be in simplified Chinese (Markdown format).

Structure:
1. **Weak Point Analysis**: Summarize the Common errors (e.g., specific grammar points, vocabulary types).
2. **Key Concepts**: Briefly explain 2-3 most critical concepts they missed.
3. **Study Plan**: 3 actionable steps for the next week.

Keep it encouraging but precise.`

    const userPrompt = `Here are the questions I answered incorrectly or struggled with recently:
${mistakes.map((m: any, i: number) => `${i + 1}. [${m.type}] ${m.content} (Note: ${m.note})`).join('\n')}

Please generate a personalized study report.`

    // 5. Call AI
    try {
        let targetUrl = baseUrl;
        if (!targetUrl) {
            if (activeProvider === 'deepseek') targetUrl = 'https://api.deepseek.com';
            else if (activeProvider === 'zhipu') targetUrl = 'https://open.bigmodel.cn/api/paas/v4';
            else if (activeProvider === 'openai') targetUrl = 'https://api.openai.com/v1';
        }

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
            temperature: 0.7
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
            if (response.status === 401) {
                return NextResponse.json({ error: `Invalid AI API Key (401) for provider: ${activeProvider}` }, { status: 401 })
            }
            throw new Error(`Provider API Error: ${response.status} ${err}`)
        }

        const aiData = await response.json()
        const report = aiData.choices[0].message.content

        return NextResponse.json({ report })

    } catch (e: any) {
        console.error("AI Analyze Errors Failed:", e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
