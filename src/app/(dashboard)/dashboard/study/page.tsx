"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { Loader2, Trophy, AlertTriangle } from "lucide-react"
import RecitationSession, { SessionResult } from "@/components/recitation/RecitationSession"
import { Question } from "@/types"

export default function StudyPage() {
    const [loading, setLoading] = useState(true)
    const [batch, setBatch] = useState<Question[]>([])
    const [sessionComplete, setSessionComplete] = useState(false)
    // Removed local client creation, using imported singleton

    // State for debug logs
    const [debugLogs, setDebugLogs] = useState<string[]>([])
    const addLog = (msg: string) => setDebugLogs(prev => [...prev.slice(-4), msg])

    // Check for saved session on mount
    useEffect(() => {
        // v5 cache key for debug session
        const savedBatch = sessionStorage.getItem('current_study_session_v5')
        if (savedBatch) {
            try {
                const parsed = JSON.parse(savedBatch)
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setDebugLogs(["Refreshed from Cache (v5)"])
                    setBatch(parsed)
                    setLoading(false)
                    return
                }
            } catch (e) {
                sessionStorage.removeItem('current_study_session_v5')
            }
        }

        // If not restored, fetch fresh
        // We need to wait a tick to ensure hydration? No, usually fine.
        fetchStudyBatch()
    }, [])

    // Save session whenever batch changes (and isn't empty)
    useEffect(() => {
        if (batch.length > 0 && !sessionComplete) {
            sessionStorage.setItem('current_study_session_v5', JSON.stringify(batch))
        }
    }, [batch, sessionComplete])

    const fetchStudyBatch = async () => {
        setLoading(true)
        // Log DB info inside fetch to prevent overwrite
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL
        const projectRef = url?.split('//')[1]?.split('.')[0] || 'unknown'

        // Reset logs but START with DB info
        setDebugLogs([`App v5.1-SharedClient | DB: ...${projectRef.slice(-4)}`])

        try {
            const { data: { user }, error: uError } = await supabase.auth.getUser()

            if (uError) {
                addLog(`Auth Error: ${uError.message}`)
                console.error("Auth Fail:", uError)
                return
            }
            if (!user) {
                addLog("No User Session Found!")
                return
            }
            addLog(`User: ...${user.id.slice(-4)}`)

            addLog("Fetching initial candidates...")
            // 1. Get Initial Candidates (Due Reviews)
            // Filter by vocabulary type to ensure only word-families/recitation items are shown
            const { data: reviews, error: rError } = await supabase
                .from('user_progress')
                .select('question_id, questions!inner(*)') // Use !inner to allow filtering on joined record
                .eq('user_id', user.id)
                .eq('questions.type', 'vocabulary')
                .lte('next_review_at', new Date().toISOString())
                .neq('status', 'mastered')
                .limit(2)

            if (rError) throw rError

            let candidates: Question[] = reviews?.map((r: any) => r.questions).filter(q => q) || []
            addLog(`Found ${candidates.length} reviews`)

            // 2. Fill with New Words
            if (candidates.length < 2) {
                const limit = 2 - candidates.length

                // Exclude existing progress items
                const { data: progress } = await supabase
                    .from('user_progress')
                    .select('question_id')
                    .eq('user_id', user.id)

                const ignoreIds = progress?.map((p: any) => p.question_id) || []
                const currentIds = candidates.map(c => c.id)
                const allIgnore = [...ignoreIds, ...currentIds]

                let query = supabase
                    .from('questions')
                    .select('*')
                    .eq('type', 'vocabulary')
                    .limit(limit)

                if (allIgnore.length > 0) {
                    query = query.not('id', 'in', `(${allIgnore.join(',')})`)
                }

                const { data: newWords, error: nError } = await query
                if (nError) {
                    addLog(`New words error: ${nError.message}`)
                    throw nError
                }

                if (newWords) {
                    candidates = [...candidates, ...newWords]
                    addLog(`Added ${newWords.length} new words`)
                }
            }

            addLog(`Candidates: ${candidates.length}`)

            // 3. SELECTION & SIBLING FETCHING
            const familyTags = new Set<string>()
            const familyRoots = new Set<string>()

            // Find first 2 unique families from candidates
            for (const q of candidates) {
                const tag = q.tags?.find(t => t.startsWith('Family:'))
                if (tag) {
                    const familyId = tag.replace('Family:', '').trim()
                    if (familyId && (familyTags.has(tag) || familyTags.size < 2)) {
                        familyTags.add(tag)
                        if (familyId.length > 2) familyRoots.add(familyId)
                    }
                }
                if (familyTags.size >= 2) break
            }

            addLog(`Selected Families: ${Array.from(familyTags).join(', ') || 'None'}`)

            if (familyTags.size > 0) {
                // Fetch ALL members of the selected 2 families
                const tagQueries = Array.from(familyTags).map(tag =>
                    supabase.from('questions').select('*').eq('type', 'vocabulary').contains('tags', [tag])
                )

                const contentQueries = Array.from(familyRoots).map(root =>
                    supabase.from('questions').select('*').eq('type', 'vocabulary').ilike('content', `${root}%`)
                )

                const allQueries = [...tagQueries, ...contentQueries]
                const results = await Promise.all(allQueries)

                const finalMap = new Map<string, Question>()

                results.forEach((res) => {
                    if (res.data) {
                        res.data.forEach((q: Question) => {
                            finalMap.set(q.id, q)
                        })
                    }
                })

                addLog(`Total Batch Size: ${finalMap.size} (${familyTags.size} families)`)
                setBatch(Array.from(finalMap.values()))
            } else {
                // Fallback: If no families found, just use the candidates (limited to first 6)
                setBatch(candidates.slice(0, 6))
            }

        } catch (error: any) {
            console.error(error)
            addLog(`Fatal: ${error.message}`)
            alert("加载学习任务失败，请刷新重试")
        } finally {
            setLoading(false)
        }
    }

    const handleSessionComplete = async (results: SessionResult[]) => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        try {
            const updates = results.map(res => {
                const now = new Date()
                let nextReview = new Date()
                nextReview.setDate(now.getDate() + 1)

                const status = (res.isPassed && !res.hasFamilyPenalty) ? 'reviewing' : 'learning'

                return {
                    user_id: user.id,
                    question_id: res.questionId,
                    status: status,
                    last_practiced_at: now.toISOString(),
                    next_review_at: nextReview.toISOString(),
                    consecutive_correct: (res.isPassed && !res.hasFamilyPenalty) ? 1 : 0
                }
            })

            const { error } = await supabase.from('user_progress').upsert(updates, {
                onConflict: 'user_id,question_id'
            })

            if (error) throw error

            // Clear session storage only on success
            sessionStorage.removeItem('current_study_session_v5')
            setSessionComplete(true)

        } catch (error: any) {
            console.error("Failed to save progress:", error)
            alert(`保存进度失败: ${error.message || '网络错误'}，请不要关闭页面，尝试重新提交。`)
        }
    }

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                <span className="ml-2 text-gray-500">正在生成背诵任务 (智能调度中)...</span>
            </div>
        )
    }

    if (sessionComplete) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-indigo-50 p-4">
                <Trophy className="w-24 h-24 text-yellow-400 mb-6 drop-shadow-lg" />
                <h1 className="text-4xl font-bold text-indigo-900 mb-2 font-comic text-center">
                    太棒了! 任务完成!
                </h1>
                <p className="text-gray-600 mb-8 max-w-md text-center">
                    进度已永久保存到云端。
                </p>
                <div className="flex space-x-4">
                    <button
                        onClick={() => {
                            window.location.href = '/dashboard'
                        }}
                        className="px-6 py-3 rounded-full border-2 border-indigo-200 text-indigo-600 font-bold hover:bg-indigo-50"
                    >
                        返回主页
                    </button>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-8 py-3 rounded-full bg-indigo-600 text-white font-bold shadow-lg hover:scale-105 transition"
                    >
                        继续下一组
                    </button>
                </div>
            </div>
        )
    }

    if (batch.length === 0) {
        return (
            <div className="relative flex flex-col items-center justify-center h-[60vh]">
                <h2 className="text-2xl font-bold text-gray-700 mb-2">🎉 全部完成!</h2>
                <p className="text-gray-500">今日没有待复习的单词，也没有新单词了。</p>
                <div className="text-xs text-gray-400 mt-2 max-w-xs text-center border p-2 rounded border-dashed">
                    如果这不正常，请检查:
                    1. 是否已导入单词?
                    2. 是否运行了 RLS 权限修复脚本?
                </div>
                <button
                    onClick={() => {
                        sessionStorage.removeItem('current_study_session_v5') // Cleanup just in case
                        window.location.href = '/dashboard'
                    }}
                    className="mt-6 px-6 py-2 bg-indigo-600 text-white rounded-full"
                >
                    返回
                </button>

                {/* Debug Overlay kept visible -> Hidden per request 
                <div className="fixed bottom-0 left-0 right-0 bg-black/90 text-green-400 p-2 text-xs font-mono z-50 max-h-48 overflow-y-auto hidden">
                    ...
                </div>
                */}
            </div>
        )
    }

    // MAIN RENDER: The Session Container
    return (
        <div className="relative">
            {/* DEBUG OVERLAY - Hidden for production requested by user
            <div className="fixed bottom-0 left-0 right-0 bg-black/90 text-green-400 p-2 text-xs font-mono z-50 max-h-48 overflow-y-auto hidden">
                <div className="border-b border-gray-700 pb-1 mb-1">
                    v4 Cache | Batch: {batch.length} | logs: {debugLogs.length}
                </div>
                {debugLogs.map((log, i) => (
                    <div key={i} className="opacity-80">&gt; {log}</div>
                ))}
            </div>
            */}

            <RecitationSession
                batch={batch}
                onComplete={handleSessionComplete}
            />
        </div>
    )
}
