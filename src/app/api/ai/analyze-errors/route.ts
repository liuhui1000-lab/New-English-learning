
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const maxDuration = 60; // Allow up to 60s for AI processing

// Helper: Create admin client (service_role, bypasses RLS)
function createAdminClient(fallbackClient: any) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
        console.warn("Missing Supabase Admin credentials, falling back to standard client")
        return fallbackClient
    }

    return createClient(url, key)
}

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

    // 2. Parse Body Payload
    const body = await request.json().catch(() => ({}))
    const { userId: requestedUserId, recent, frequent, stats } = body

    if (requestedUserId && requestedUserId !== user.id) {
        // Only admins can analyze others
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        if (profile?.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        targetUserId = requestedUserId
    }

    // Variables for analysis data
    let statsText = ""
    let recentSamples: any[] = []
    let frequentSamples: any[] = []
    let totalErrors = 0
    let allMistakes: any[] = []

    // Strategy Selection
    const useSmartSampling = !!(recent && frequent);

    if (useSmartSampling) {
        // --- Plan A: Use Frontend Smart Sampling (Preferred) ---
        recentSamples = recent
        frequentSamples = frequent
        totalErrors = stats?.total || (recent.length + frequent.length)

        if (stats?.type_distribution) {
            statsText = Object.entries(stats.type_distribution)
                .map(([k, v]: [string, any]) => `- ${k}: ${v} (${Math.round(v / (stats.total || 1) * 100)}%)`)
                .join('\n')
        }
    } else {
        // --- Plan B: Server-Side Fallback (Legacy) ---
        console.log("Using Legacy Server-Side Aggregation")

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

        // Fetch Quiz Mistakes (Increase limit for stats)
        const { data: quizData } = await supabase
            .from('quiz_results')
            .select(`*, questions (id, content, answer, type, explanation)`)
            .eq('user_id', targetUserId)
            .eq('is_correct', false)
            .order('attempt_at', { ascending: false })
            .limit(500) // Fetch more to get better stats

        if (quizData) {
            quizData.forEach((record: any) => {
                if (record.questions) {
                    // Check if already exists (from recitation or previous quiz item)
                    const existing = allMistakes.find(m => m.id === record.questions.id)
                    if (existing) {
                        existing.count += 1
                    } else {
                        allMistakes.push({
                            id: record.questions.id,
                            content: record.questions.content,
                            type: 'quiz',
                            subType: record.questions.type, // grammar, collocation, etc.
                            note: record.questions.type === 'grammar' ? 'Grammar' : 'Collocation',
                            count: 1,
                            lastAttempt: record.attempt_at
                        })
                    }
                }
            })
        }

        if (allMistakes.length === 0) {
            return NextResponse.json({ error: "没有足够的错题数据进行分析。" }, { status: 400 })
        }

        // --- Smart Aggregation Strategy ---
        totalErrors = allMistakes.length

        // 1. Stats by Type
        const typeStats: Record<string, number> = {}
        allMistakes.forEach(m => {
            const t = m.subType || m.type
            typeStats[t] = (typeStats[t] || 0) + 1
        })
        statsText = Object.entries(typeStats)
            .map(([k, v]) => `- ${k}: ${v} (${Math.round(v / totalErrors * 100)}%)`)
            .join('\n')

        // 2. Top Weaknesses (By Frequency)
        const topWeaknesses = [...allMistakes]
            .sort((a, b) => b.count - a.count)
            .slice(0, 20)

        // 3. Recent Samples (By Date, excluding duplicates in top)
        const recentSamplesLegacy = [...allMistakes]
            .filter(m => !topWeaknesses.includes(m))
            .sort((a, b) => new Date(b.lastAttempt || 0).getTime() - new Date(a.lastAttempt || 0).getTime())
            .slice(0, 50)

        // Assign to main variables (Simulate usage)
        recentSamples = recentSamplesLegacy.slice(0, 10)
        frequentSamples = topWeaknesses.slice(0, 10)
    }

    // 3. Get AI Settings using Service Role to bypass RLS (students can't read settings directly)
    const adminClient = createAdminClient(supabase)
    const { data: settingsData } = await adminClient.from('system_settings').select('key, value')
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
    const systemPrompt = `You are an expert English teacher. Analyze the student's mistakes based on the provided data.
Output a diagnostic report in Simplified Chinese (Markdown).

Structure:
1. **Overview**: Summarize the student's error distribution.
2. **Current Status (Recent Mistakes)**: Analyze the 'Recent' list to diagnose immediate issues (e.g., careless errors, specific new topics).
3. **Root Causes (High Frequency)**: Analyze the 'High Frequency' list to identify deep-rooted, recurring weaknesses.
4. **Action Plan**: Provide specific steps to address the identified long-term weaknesses.

**Important**: For 'Recitation Mistakes', just include the top 10 list in the overview/stats section. Do NOT perform deep pedagogical analysis on them. Focus your core analysis on the 'Practice Questions' sections.`

    // Helper to format sample
    const formatSample = (m: any, idx: number) => {
        const tagInfo = (m.tags && m.tags.length > 0) ? m.tags.join(',') : (m.subType || m.type || 'General')
        const countInfo = m.user_error_count || m.count || 1
        return `${idx + 1}. [${tagInfo}] ${m.content} (Error Count: ${countInfo})`
    }

    // Filter out recitation for AI prompt (Keep only quiz/exercise mistakes)
    const filteredRecent = recentSamples.filter((m: any) => m.type !== 'recitation' && m.subType !== 'recitation')
    const filteredFrequent = frequentSamples.filter((m: any) => m.type !== 'recitation' && m.subType !== 'recitation')
    const recitationSamples = (useSmartSampling ? (body.frequent || []) : frequentSamples)
        .filter((m: any) => m.type === 'recitation' || m.subType === 'recitation')
        .slice(0, 10)

    const userPrompt = `Student Error Data:

[Section A: Statistics]
Total Errors Analyzed: ${totalErrors}
Distribution:
${statsText}

[Section B: Recitation Top 10 (Stats Only - DO NOT ANALYZE DEEPLY)]
${recitationSamples.length > 0 ? recitationSamples.map((m: any, i: number) => `${i + 1}. ${m.content} (Freq: ${m.user_error_count || m.count || 1})`).join('\n') : "(None)"}

[Section C: Recent Mistakes (Practice Questions Only - ANALYZE THESE)]
${filteredRecent.length > 0 ? filteredRecent.map((m: any, i: number) => formatSample(m, i)).join('\n') : "(None found in this sample)"}

[Section D: High Frequency / Persistent Mistakes (Practice Questions Only - ANALYZE THESE)]
${filteredFrequent.length > 0 ? filteredFrequent.map((m: any, i: number) => formatSample(m, i)).join('\n') : "(None found in this sample)"}

Please generate the diagnostic report.`

    try {
        let targetUrl = (baseUrl || '').trim();
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
                'Authorization': `Bearer ${(apiKey || '').trim()}`
            },
            body: JSON.stringify(payload)
        })

        if (!response.ok) {
            const err = await response.text()
            throw new Error(`AI Error ${response.status}: ${err}`)
        }

        const aiData = await response.json()
        const report = aiData.choices[0]?.message?.content

        if (!report) {
            throw new Error("AI 返回了空报告，请稍后再试。")
        }

        // 5. Save Report (Use Service Role to bypass RLS for administrative reports)
        const { data: savedData, error: saveError } = await adminClient
            .from('error_analysis_reports')
            .insert({
                user_id: targetUserId,
                report_content: report,
                mistake_count: totalErrors,
                triggered_by: user.id
            })
            .select()
            .single()

        if (saveError) {
            console.error("Failed to save report:", saveError)
            return NextResponse.json({ error: "报告生成成功但保存失败: " + saveError.message, report }, { status: 500 })
        }

        return NextResponse.json({ report: savedData, success: true })

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

    // Fetch latest 10 reports
    const { data: reports, error: reportsError } = await supabase
        .from('error_analysis_reports')
        .select('*')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(10)

    if (reportsError) {
        console.error("Failed to fetch AI report history from POSTGREST:", reportsError)
    }

    // Safely attach triggered_by_profile by fetching profiles manually (avoiding ambiguous foreign key constraint names)
    if (reports && reports.length > 0) {
        const triggerIds = Array.from(new Set(reports.map(r => r.triggered_by).filter(Boolean)))
        if (triggerIds.length > 0) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, username, display_name')
                .in('id', triggerIds)

            if (profiles) {
                const profileMap = Object.fromEntries(profiles.map(p => [p.id, p]))
                reports.forEach(r => {
                    if (r.triggered_by && profileMap[r.triggered_by]) {
                        r.triggered_by_profile = profileMap[r.triggered_by]
                    }
                })
            }
        }
    }

    // Calculate mistakes since last report
    let newMistakesCount = 0
    let lastAnalyzedAt = reports && reports.length > 0 ? reports[0].created_at : null

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
        latestReport: reports && reports.length > 0 ? reports[0] : null,
        history: reports || [],
        newMistakesCount
    })
}

export async function DELETE(request: Request) {
    const { searchParams } = new URL(request.url)
    const reportId = searchParams.get('id')

    if (!reportId) {
        return NextResponse.json({ error: 'Missing report id' }, { status: 400 })
    }

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

    // Use regular authenticated client so RLS handles the permissions perfectly
    const { error } = await supabase
        .from('error_analysis_reports')
        .delete()
        .eq('id', reportId)

    if (error) {
        console.error("Failed to delete report:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
