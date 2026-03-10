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

    const [fetchWarning, setFetchWarning] = useState<string | null>(null)

    // State for debug logs
    const [debugLogs, setDebugLogs] = useState<string[]>([])
    const addLog = (msg: string) => setDebugLogs(prev => [...prev.slice(-4), msg])

    // Check for saved session on mount
    useEffect(() => {
        // v5 cache key for focus session
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
        fetchStudyBatch()
    }, [])

    // Save session whenever batch changes
    useEffect(() => {
        if (batch.length > 0 && !sessionComplete) {
            sessionStorage.setItem('current_study_session_v5', JSON.stringify(batch))
        }
    }, [batch, sessionComplete])

    const fetchStudyBatch = async () => {
        setLoading(true)
        setFetchWarning(null)
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL
        const projectRef = url?.split('//')[1]?.split('.')[0] || 'unknown'
        setDebugLogs([`App v5.7-StrictFamily | DB: ...${projectRef.slice(-4)}`])

        try {
            const { data: { user }, error: uError } = await supabase.auth.getUser()
            if (uError || !user) {
                addLog(user ? `Auth: OK` : `Auth: Not found`)
                return
            }

            addLog("Checking for due reviews...")
            // 1. Get Due Reviews (Already in progress)
            const { data: reviews } = await supabase
                .from('user_progress')
                .select('question_id, questions!inner(*)')
                .eq('user_id', user.id)
                .in('questions.type', ['vocabulary', 'word_transformation'])
                .lte('next_review_at', new Date().toISOString())
                .neq('status', 'mastered')
                .limit(40)

            const allDue: Question[] = reviews?.map((r: any) => r.questions).filter((q: Question) => q && !/[A-D][\)\.]/.test(q.content)) || []
            addLog(`Due items: ${allDue.length}`)

            // 2. Identify potential families
            const familyTags = new Set<string>()

            // First pass: look in due items
            for (const q of allDue) {
                const tag = q.tags?.find((t: string) => t.startsWith('Family:'))
                if (tag) familyTags.add(tag)
                if (familyTags.size >= 2) break
            }

            // Second pass: if < 2 families, look for NEW words that belong to families
            if (familyTags.size < 2) {
                addLog("Checking new words for families...")
                const progressIds = (await supabase.from('user_progress').select('question_id').eq('user_id', user.id)).data?.map((p: any) => p.question_id) || []

                // Fetch a broad pool of recent questions to find new families
                let newQuery = supabase.from('questions')
                    .select('*')
                    .in('type', ['vocabulary', 'word_transformation'])
                    .limit(200)

                if (progressIds.length > 0) newQuery = newQuery.not('id', 'in', `(${progressIds.join(',')})`)

                const { data: potentialNew } = await newQuery
                const cleanNew = (potentialNew || []).filter((q: Question) => !/[A-D][\)\.]/.test(q.content))

                for (const q of cleanNew) {
                    const tag = q.tags?.find((t: string) => t.startsWith('Family:'))
                    if (tag) {
                        familyTags.add(tag)
                    }
                    if (familyTags.size >= 2) break
                }
            }

            addLog(`Selected Families: ${familyTags.size}`)

            // 3. EFFECTIVE BATCHING
            if (familyTags.size > 0) {
                const tagQueries = Array.from(familyTags).map(tag =>
                    supabase.from('questions')
                        .select('*')
                        .in('type', ['vocabulary', 'word_transformation'])
                        .filter('tags', 'cs', JSON.stringify([tag]))
                )

                const results = await Promise.all(tagQueries)
                const finalMap = new Map<string, Question>()
                results.forEach(res => {
                    res.data?.forEach((q: Question) => {
                        if (!/[A-D][\)\.]/.test(q.content)) finalMap.set(q.id, q)
                    })
                })

                if (finalMap.size > 0) {
                    addLog(`Batch Ready: ${finalMap.size} questions`)
                    setBatch(Array.from(finalMap.values()))
                    return // SUCCESS
                }
            }

            // 4. FALLBACK (If no families can be formed)
            if (allDue.length > 0) {
                addLog("Strict Family failed. Falling back to reviews.")
                setFetchWarning("无法自动锁定词族。当前正在为您推送待复习的独立单词，请联系管理员完善题目标签。")
                setBatch(allDue.slice(0, 10))
            } else {
                addLog("Empty Batch (No families, no due)")
                setBatch([])
            }

        } catch (error: any) {
            console.error(error)
            addLog(`Fatal: ${error.message}`)
            alert("生成任务失败，请检查网络并刷新")
        } finally {
            setLoading(false)
        }
    }

    const handleSessionComplete = async (results: SessionResult[]) => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        try {
            // Fetch existing progress first to get current attempts count
            const { data: existingProgress } = await supabase
                .from('user_progress')
                .select('question_id, attempts')
                .eq('user_id', user.id)
                .in('question_id', results.map(r => r.questionId))

            const progressMap = new Map(existingProgress?.map(p => [p.question_id, p.attempts]) || [])

            const updates = results.map(res => {
                const now = new Date()
                let nextReview = new Date()
                nextReview.setDate(now.getDate() + 1)
                const status = (res.isPassed && !res.hasFamilyPenalty) ? 'reviewing' : 'learning'

                const currentAttempts = progressMap.get(res.questionId) || 0
                const newAttempts = (!res.isPassed || res.hasFamilyPenalty) ? currentAttempts + 1 : currentAttempts

                return {
                    user_id: user.id,
                    question_id: res.questionId,
                    status: status,
                    last_practiced_at: now.toISOString(),
                    next_review_at: nextReview.toISOString(),
                    consecutive_correct: (res.isPassed && !res.hasFamilyPenalty) ? 1 : 0,
                    attempts: newAttempts
                }
            })

            const { error } = await supabase.from('user_progress').upsert(updates, {
                onConflict: 'user_id,question_id'
            })
            if (error) throw error
            sessionStorage.removeItem('current_study_session_v5')
            setSessionComplete(true)
        } catch (error: any) {
            console.error("Failed to save progress:", error)
        }
    }

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                <span className="ml-2 text-gray-500">正在生成词转背诵任务 (智能调度中)...</span>
            </div>
        )
    }

    if (sessionComplete) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-indigo-50 p-4">
                <Trophy className="w-24 h-24 text-yellow-400 mb-6 drop-shadow-lg" />
                <h1 className="text-4xl font-bold text-indigo-900 mb-2 font-comic text-center">太棒了! 词转背诵完成!</h1>
                <p className="text-gray-600 mb-8 max-w-md text-center">进度已永久保存到云端。</p>
                <div className="flex space-x-4">
                    <button onClick={() => window.location.href = '/dashboard'} className="px-6 py-3 rounded-full border-2 border-indigo-200 text-indigo-600 font-bold hover:bg-indigo-50">返回主页</button>
                    <button onClick={() => window.location.reload()} className="px-8 py-3 rounded-full bg-indigo-600 text-white font-bold shadow-lg hover:scale-105 transition">继续下一组</button>
                </div>
            </div>
        )
    }

    if (batch.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh]">
                <h2 className="text-2xl font-bold text-gray-700 mb-2">🎉 全部完成!</h2>
                <div className="max-w-md text-center space-y-2">
                    <p className="text-gray-500">今日没有待复习的内容，暂无词族可供背诵。</p>
                    <p className="text-xs text-gray-400 bg-gray-50 p-2 rounded border border-dashed">
                        诊断：如果词库中有题但无法生成，可能是由于题目未标记 `Family:xxx` 标签。请联系管理员修正。
                    </p>
                </div>
                <button onClick={() => window.location.href = '/dashboard'} className="mt-6 px-6 py-2 bg-indigo-600 text-white rounded-full">返回主页</button>
            </div>
        )
    }

    return (
        <div className="relative min-h-screen bg-white">
            {fetchWarning && (
                <div className="bg-amber-50 border-b border-amber-100 p-3 text-sm text-amber-700 flex items-center justify-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    <span>{fetchWarning}</span>
                </div>
            )}
            <RecitationSession
                batch={batch}
                onComplete={handleSessionComplete}
            />
        </div>
    )
}
