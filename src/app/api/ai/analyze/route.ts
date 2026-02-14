import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
    const supabase = createRouteHandlerClient({ cookies })

    // 1. Check Admin Role
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
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

    const settings: any = {}
    if (settingsData) {
        settingsData.forEach((s: any) => settings[s.key] = s.value)
    }

    if (!settings.ai_api_key) {
        return NextResponse.json({ error: 'AI API Key not configured' }, { status: 400 })
    }

    // 3. Parse Request Body
    const { items, mode } = await request.json() // items: string[] (questions)

    // 4. Construct Prompt
    const systemPrompt = `You are an expert English teacher for middle school students in Shanghai.
Your task is to analyze the given English questions (Grammar / Vocabulary) and provide metadata.
Return ONLY valid JSON array. Each object should have:
- "index": (int) matching input order
- "topic": (string) e.g., "定语从句", "现在完成时", "固定搭配", "词义辨析"
- "difficulty": (int) 1-5
- "key_point": (string) short explanation of the tested point.

Input Questions:
`
    const userPrompt = items.map((q: string, i: number) => `${i}. ${q}`).join('\n')

    // 5. Call AI Provider
    try {
        const payload = {
            model: settings.ai_model || 'deepseek-chat',
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.1
        }

        const response = await fetch(`${settings.ai_base_url}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.ai_api_key}`
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
                return NextResponse.json({ error: "Invalid AI API Key (401). Check Settings." }, { status: 401 })
            }
            if (response.status >= 500) {
                return NextResponse.json({ error: "AI Provider Server Error (5xx). Try changing model." }, { status: 502 })
            }

            throw new Error(`Provider API Error: ${response.status} ${err}`)
        }

        const aiData = await response.json()
        const content = aiData.choices[0].message.content

        // 6. Parse JSON from AI content
        // Handle potential markdown code blocks
        const jsonStr = content.replace(/```json\n?|\n?```/g, '')
        const parsedResults = JSON.parse(jsonStr)

        return NextResponse.json({ results: parsedResults })

    } catch (e: any) {
        console.error("AI Analyze Error:", e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
