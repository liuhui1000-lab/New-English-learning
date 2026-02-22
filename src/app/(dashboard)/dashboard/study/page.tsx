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
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL
        const projectRef = url?.split('//')[1]?.split('.')[0] || 'unknown'
        setDebugLogs([`App v5.4-TagOnly | DB: ...${projectRef.slice(-4)}`])

        try {
            const { data: { user }, error: uError } = await supabase.auth.getUser()
            if (uError || !user) {
                addLog(user ? `Auth: OK` : `Auth: Not found`)
                return
            }

            addLog("Fetching recitation candidates...")
            // 1. Get Initial Candidates (Due Reviews)
            const { data: reviews } = await supabase
                .from('user_progress')
                .select('question_id, questions!inner(*)')
                .eq('user_id', user.id)
                .in('questions.type', ['vocabulary', 'word_transformation'])
                .lte('next_review_at', new Date().toISOString())
                .neq('status', 'mastered')
                .limit(40)

            let pool: Question[] = reviews?.map((r: any) => r.questions).filter(q => q) || []

            // Step 2. Fill with New Words if needed
            if (pool.length < 10) {
                const fillLimit = 20
                const progressIds = (await supabase.from('user_progress').select('question_id').eq('user_id', user.id)).data?.map((p: any) => p.question_id) || []
                const currentIds = pool.map(c => c.id)
                const allIgnore = [...progressIds, ...currentIds]

                let query = supabase.from('questions').select('*').in('type', ['vocabulary', 'word_transformation']).limit(fillLimit)
                if (allIgnore.length > 0) query = query.not('id', 'in', `(${allIgnore.join(',')})`)

                const { data: newWords } = await query
                if (newWords) pool = [...pool, ...newWords]
            }

            // Exclude anything that looks like Multiple Choice
            const recitationPool = pool.filter(q => !/[A-D][\)\.]/.test(q.content))
            addLog(`Recitation Pool: ${recitationPool.length}`)

            if (recitationPool.length === 0) {
                setBatch([])
                setLoading(false)
                return
            }

            // 3. SELECTION & TAG-ONLY FETCHING (Strictly 2 families)
            const familyTags = new Set<string>()

            for (const q of recitationPool) {
                const tag = q.tags?.find(t => t.startsWith('Family:'))
                if (tag) {
                    if (familyTags.has(tag) || familyTags.size < 2) {
                        familyTags.add(tag)
                    }
                }
                if (familyTags.size >= 2) break
            }

            addLog(`Families: ${familyTags.size}`)

            if (familyTags.size > 0) {
                // Fetch ALL members of the selected exactly-2 tags
                const tagQueries = Array.from(familyTags).map(tag =>
                    supabase.from('questions').select('*').in('type', ['vocabulary', 'word_transformation']).contains('tags', [tag])
                )

                const results = await Promise.all(tagQueries)
                const finalMap = new Map<string, Question>()
                results.forEach(res => res.data?.forEach((q: Question) => finalMap.set(q.id, q)))

                addLog(`Batch Ready: ${finalMap.size} questions`)
                setBatch(Array.from(finalMap.values()))
            } else {
                addLog("Fallback to mixed recitation")
                setBatch(recitationPool.slice(0, 6))
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
                <p className="text-gray-500 text-center">今日没有待复习的内容，也没有新单词了。</p>
                <button onClick={() => window.location.href = '/dashboard'} className="mt-6 px-6 py-2 bg-indigo-600 text-white rounded-full">返回主页</button>
            </div>
        )
    }

    return (
        <RecitationSession
            batch={batch}
            onComplete={handleSessionComplete}
        />
    )
}
