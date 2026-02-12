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

    useEffect(() => {
        fetchStudyBatch()
    }, [])

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

            let questions: Question[] = reviews?.map((r: any) => r.questions) || []

            // 2. If not enough reviews, fill with New Words
            if (questions.length < 5) {
                const limit = 6 - questions.length

                // Get IDs already in progress to exclude
                const { data: progress } = await supabase
                    .from('user_progress')
                    .select('question_id')
                    .eq('user_id', user.id)

                const ignoreIds = progress?.map((p: any) => p.question_id) || []

                let query = supabase
                    .from('questions')
                    .select('*')
                    .eq('type', 'vocabulary') // Only vocab for recitation
                    .limit(limit)

                if (ignoreIds.length > 0) {
                    query = query.not('id', 'in', `(${ignoreIds.join(',')})`)
                }

                const { data: newWords, error: nError } = await query
                if (nError) throw nError

                if (newWords) {
                    questions = [...questions, ...newWords]
                }
            }

            // Shuffle? Maybe keep families together?
            // For now, simple shuffle or keep order.
            setBatch(questions)

        } catch (error) {
            console.error(error)
            alert("Failed to load study batch")
        } finally {
            setLoading(false)
        }
    }

    const handleSessionComplete = async (results: SessionResult[]) => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // Process Results
        for (const res of results) {
            // Logic:
            // If Passed & No Penalty -> Upgrade Stage (Ebbinghaus)
            // If Failed or Penalty -> Force Review Tomorrow (Stage 0/1?)

            const now = new Date()
            let nextReview = new Date()
            let newStage = 0

            if (res.isPassed && !res.hasFamilyPenalty) {
                // Success
                // Calculate next interval based on current stage?
                // Need to fetch current stage first. simplified:
                // default to stage 1 (1 day) -> 2 (2 days) -> 3 (4 days) -> 4 (7 days) ...
                // For now, rough logic:
                nextReview.setDate(now.getDate() + 1) // Default 1 day
                // Ideally read current stage from DB, but for now we upsert.
                // We will simply push it to tomorrow for new words, or +interval for reviews
            } else {
                // Failure / Penalty
                // Force review tomorrow
                nextReview.setDate(now.getDate() + 1)
                newStage = 0 // Reset stage
            }

            // Upsert Progress
            // We need to fetch existing progress to know current stage if success.
            // Simplified for MVP:
            // If Penalty -> next_review = tomorrow.
            // If Success -> next_review = tomorrow + stage_factor.

            const status = (res.isPassed && !res.hasFamilyPenalty) ? 'reviewing' : 'learning'

            await supabase.from('user_progress').upsert({
                user_id: user.id,
                question_id: res.questionId,
                status: status,
                last_practiced_at: now.toISOString(),
                next_review_at: nextReview.toISOString(),
                // If penalty, reset consecutive_correct?
                consecutive_correct: (res.isPassed && !res.hasFamilyPenalty) ? 1 : 0
            }, { onConflict: 'user_id,question_id' })
        }

        setSessionComplete(true)
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
                    您已完成本组单词的学习与考核。
                    {/* Add stats summary? */}
                </p>
                <div className="flex space-x-4">
                    <button
                        onClick={() => window.location.href = '/dashboard'}
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
                    onClick={() => window.location.href = '/dashboard'}
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
