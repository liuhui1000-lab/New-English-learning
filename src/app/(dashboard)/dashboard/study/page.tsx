"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import RecitationSession, { SessionResult } from "@/components/recitation/RecitationSession"
import { Question } from "@/types"
import { Loader2, Trophy } from "lucide-react"

export default function StudyPage() {
    const [batch, setBatch] = useState<Question[]>([])
    const [loading, setLoading] = useState(true)
    const [sessionComplete, setSessionComplete] = useState(false)

    // Check for saved session on mount
    useEffect(() => {
        const savedBatch = sessionStorage.getItem('current_study_session')
        if (savedBatch) {
            try {
                const parsed = JSON.parse(savedBatch)
                if (Array.isArray(parsed) && parsed.length > 0) {
                    console.log("Restoring session from storage...")
                    setBatch(parsed)
                    setLoading(false)
                    return
                }
            } catch (e) {
                console.error("Failed to parse saved session", e)
                sessionStorage.removeItem('current_study_session')
            }
        }

        fetchStudyBatch()
    }, [])

    // Save session whenever batch changes (and isn't empty)
    useEffect(() => {
        if (batch.length > 0 && !sessionComplete) {
            sessionStorage.setItem('current_study_session', JSON.stringify(batch))
        }
    }, [batch, sessionComplete])

    const fetchStudyBatch = async () => {
        setLoading(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            // 1. Get Due Reviews (Priority)
            const { data: reviews, error: rError } = await supabase
                .from('user_progress')
                .select('question_id, questions(*)')
                .eq('user_id', user.id)
                .lte('next_review_at', new Date().toISOString())
                .neq('status', 'mastered')
                .limit(6)

            if (rError) throw rError

            let candidates: Question[] = reviews?.map((r: any) => r.questions).filter(q => q) || []

            // 2. Fill with New Words if needed
            if (candidates.length < 5) {
                const limit = 6 - candidates.length

                // Get IDs already in progress to exclude
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
                if (nError) throw nError

                if (newWords) {
                    candidates = [...candidates, ...newWords]
                }
            }

            if (candidates.length === 0) {
                setBatch([])
                return
            }

            // 3. FETCH SIBLINGS (The Critical Fix)
            // Extract all Family tags from candidates
            const familyTags = new Set<string>()
            candidates.forEach(q => {
                const tag = q.tags?.find(t => t.startsWith('Family:'))
                if (tag) familyTags.add(tag)
            })

            if (familyTags.size > 0) {
                // Fetch ALL questions that belong to these families
                // We construct an OR filter like: tags.cs.["Family:accept"],tags.cs.["Family:act"]...
                // Supabase syntax for JSON array contains is slightly tricky for OR.
                // Easier approach: Client-side merge if dataset is small, OR separate queries.
                // Given we usually have 1-5 families max per batch, parallel queries are fine.

                const familyQueries = Array.from(familyTags).map(tag =>
                    supabase
                        .from('questions')
                        .select('*')
                        .contains('tags', [tag])
                )

                const results = await Promise.all(familyQueries)

                // Merge results
                // We use a Map to Deduplicate by ID
                const finalMap = new Map<string, Question>()

                // Add original candidates first
                candidates.forEach(c => finalMap.set(c.id, c))

                // Add siblings
                results.forEach(res => {
                    if (res.data) {
                        res.data.forEach((q: Question) => finalMap.set(q.id, q))
                    }
                })

                setBatch(Array.from(finalMap.values()))
            } else {
                setBatch(candidates)
            }

        } catch (error) {
            console.error(error)
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

                // Logic:
                // If Passed & No Penalty -> Next Review Tomorrow (Start of Ebbinghaus)
                // If Failed or Penalty -> Review Tomorrow (Reset)

                nextReview.setDate(now.getDate() + 1) // Default 1 day for MVP

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

            if (error) {
                console.error("Upsert Error:", error)
                throw error
            }

            // Clear session storage only on success
            sessionStorage.removeItem('current_study_session')
            setSessionComplete(true)

        } catch (error: any) {
            console.error("Failed to save progress:", error)
            alert(`保存进度失败: ${error.message || '网络错误'}，请不要关闭页面，尝试重新提交。`)
            // Provide retry button? For now, alert implies they can try again if we exposed a button, 
            // but the UI component calls this on complete.
            // Ideally RecitationSession should accept a 'saving' state.
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
            <div className="flex flex-col items-center justify-center h-[60vh]">
                <h2 className="text-2xl font-bold text-gray-700 mb-2">🎉 全部完成!</h2>
                <p className="text-gray-500">今日没有待复习的单词，也没有新单词了。</p>
                <button
                    onClick={() => {
                        sessionStorage.removeItem('current_study_session') // Cleanup just in case
                        window.location.href = '/dashboard'
                    }}
                    className="mt-6 px-6 py-2 bg-indigo-600 text-white rounded-full"
                >
                    返回
                </button>
            </div>
        )
    }

    // MAIN RENDER: The Session Container
    return (
        <RecitationSession
            batch={batch}
            onComplete={handleSessionComplete}
        />
    )
}
