
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

    // 1. Check Auth & Target User
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (!user || authError) return NextResponse.json({ error: 'Unauthorized', details: authError?.message }, { status: 401 })

    // Check if admin is impersonating or user is acting for self
    let targetUserId = user.id
    const { userId: requestedUserId } = await request.json().catch(() => ({}))

    if (requestedUserId && requestedUserId !== user.id) {
        // Only admins can analyze others
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        if (profile?.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        targetUserId = requestedUserId
    }

    // 2. Aggregate Mistakes (Server-Side)
    const allMistakes: any[] = []

    // Fetch Recitation Mistakes
    const { data: recitationData } = await supabase
        .from('user_progress')
        .select(`*, questions (id, content, answer, type)`)
        .eq('user_id', targetUserId)
        .eq('status', 'learning')
        .gt('attempts', 0)

    if (recitationData) {
        recitationData.forEach((record: any) => {
            if (record.questions) {
                allMistakes.push({
                    id: record.questions.id,
                    content: record.questions.content,
                    type: 'recitation',
                    note: 'Spelling / Memory',
                    count: record.attempts
                })
            }
        })
    }

    // Fetch Quiz Mistakes
    const { data: quizData } = await supabase
        .from('quiz_results')
        .select(`*, questions (id, content, answer, type, explanation)`)
        .eq('user_id', targetUserId)
        .eq('is_correct', false)
        .order('attempt_at', { ascending: false })
        .limit(100)

    if (quizData) {
        quizData.forEach((record: any) => {
            if (record.questions && !allMistakes.find(m => m.id === record.questions.id)) {
                allMistakes.push({
                    id: record.questions.id,
                    content: record.questions.content,
                    type: 'quiz',
                    note: record.questions.type === 'grammar' ? 'Grammar' : 'Collocation',
                    count: 1
                })
            }
        })
    }

    if (allMistakes.length === 0) {
        return NextResponse.json({ report: "没有足够的错题数据进行分析。" })
    }

    // 3. Get AI Settings
    const { data: settingsData } = await supabase.from('system_settings').select('key, value')
    const settingsMap: Record<string, string> = {}
    if (settingsData) settingsData.forEach((s: any) => settingsMap[s.key] = s.value)

    const activeProvider = settingsMap['ai_provider'] || 'deepseek'
    let apiKey = settingsMap['ai_api_key']
    let baseUrl = settingsMap['ai_base_url']
    let model = settingsMap['ai_model']

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

    if (!apiKey) return NextResponse.json({ error: 'AI API Key not configured' }, { status: 400 })

    // 4. Call AI
    const systemPrompt = `You are an expert English teacher. Analyze the student's mistakes and provide a diagnostic report in Simplified Chinese (Markdown).
Structure:
1. **Weak Point Analysis**: Common errors.
2. **Key Concepts**: Critical concepts missed.
3. **Study Plan**: 3 actionable steps.
Keep it encouraging.`

    const userPrompt = `Here are the questions I answered incorrectly or struggled with recently (up to 100 items):
${allMistakes.slice(0, 100).map((m: any, i: number) => `${i + 1}. [${m.type}] ${m.content} (Note: ${m.note})`).join('\n')}

Please generate a personalized study report.`

    try {
        let targetUrl = baseUrl || '';
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
            throw new Error(`AI Error ${response.status}: ${err}`)
        }

        const aiData = await response.json()
        const report = aiData.choices[0].message.content

        // 5. Save Report
        const { error: saveError } = await supabase
            .from('error_analysis_reports')
            .insert({
                user_id: targetUserId,
                report_content: report,
                mistake_count: allMistakes.length
            })

        if (saveError) {
            console.error("Failed to save report:", saveError)
            // Check if it's table missing error, maybe fallback?
            // But we want to fail loudly on dev or just return report on prod
        }

        return NextResponse.json({ report, success: true })

    } catch (e: any) {
        console.error("AI Analyze Errors Failed:", e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const requestedUserId = searchParams.get('userId')

    const cookieStore = await cookies()
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() { return cookieStore.getAll() },
                setAll(cookiesToSet) { try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch { } },
            },
        }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let targetUserId = user.id
    if (requestedUserId && requestedUserId !== user.id) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        if (profile?.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        targetUserId = requestedUserId
    }

    // Fetch latest report
    const { data: report } = await supabase
        .from('error_analysis_reports')
        .select('*')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

    // Calculate mistakes since last report
    let newMistakesCount = 0
    let lastAnalyzedAt = report ? report.created_at : null

    // Simple count of quiz results after last analysis
    // Ideally we count unique questions, but row count is ok for now
    let query = supabase
        .from('quiz_results')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', targetUserId)
        .eq('is_correct', false)

    if (lastAnalyzedAt) {
        query = query.gt('attempt_at', lastAnalyzedAt)
    }

    const { count } = await query
    newMistakesCount = count || 0

    return NextResponse.json({
        latestReport: report,
        newMistakesCount
    })
}
