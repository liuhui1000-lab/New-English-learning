"use client"

import Link from "next/link"
import { BookOpen, PenTool, Upload, AlertCircle, TrendingUp } from "lucide-react"
import StudyStatsCard from "@/components/dashboard/StudyStatsCard"
import QuizStatsCard from "@/components/dashboard/QuizStatsCard"
import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"

export default function StudentDashboardPage() {
    const [loading, setLoading] = useState(true)
    const [studyStats, setStudyStats] = useState({
        total: 0,
        mastered: 0,
        reviewing: 0,
        learning: 0,
        new: 0
    })
    const [quizStats, setQuizStats] = useState({
        totalAttempts: 0,
        correctCount: 0,
        errorCount: 0
    })
    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    useEffect(() => {
        const fetchStats = async () => {
            setLoading(true)
            const { data: { user } } = await supabase.auth.getUser()

            if (!user) {
                setLoading(false)
                return
            }

            // 1. Fetch Study Progress (Vocabulary)
            // Aggregating from user_progress table
            const { data: progressData } = await supabase
                .from('user_progress')
                .select('status')
                .eq('user_id', user.id)

            // TODO: Also fetch total 'questions' count to calculate 'new'
            // For now, we simulate 'new' or just show tracked ones

            const stats = {
                total: 0,
                mastered: 0,
                reviewing: 0,
                learning: 0,
                new: 0
            }

            if (progressData) {
                progressData.forEach((item: any) => {
                    if (item.status === 'mastered') stats.mastered++
                    else if (item.status === 'reviewing') stats.reviewing++
                    else if (item.status === 'learning') stats.learning++
                })
                stats.total = stats.mastered + stats.reviewing + stats.learning
                // We don't know 'new' without querying all questions count vs user_progress count
                // Let's do a quick count of questions table
                const { count } = await supabase.from('questions').select('*', { count: 'exact', head: true })
                if (count) {
                    stats.new = count - stats.total
                    stats.total = count // Correct total to be valid questions
                }
            }
            setStudyStats(stats)

            // 2. Fetch Quiz Results
            // Aggregating from quiz_results table
            // Note: If table doesn't exist yet, this will fail silently or return error
            const { data: quizData, error } = await supabase
                .from('quiz_results')
                .select('is_correct')
                .eq('user_id', user.id)

            if (quizData && !error) {
                const total = quizData.length
                const correct = quizData.filter((q: any) => q.is_correct).length
                setQuizStats({
                    totalAttempts: total,
                    correctCount: correct,
                    errorCount: total - correct
                })
            }

            setLoading(false)
        }

        fetchStats()
    }, [supabase])

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">学习中心</h2>
                <div className="text-sm text-gray-500">
                    最后更新: {new Date().toLocaleTimeString()}
                </div>
            </div>

            {/* Top Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <StudyStatsCard stats={studyStats} loading={loading} />
                <QuizStatsCard stats={quizStats} loading={loading} />
            </div>

            {/* Action Cards */}
            <h3 className="text-xl font-bold text-gray-900 mt-8">开始学习</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Study Mode */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition cursor-pointer group">
                    <div className="flex items-center justify-between mb-4">
                        <div className="bg-blue-50 p-3 rounded-lg group-hover:bg-blue-100 transition">
                            <BookOpen className="text-blue-600 h-6 w-6" />
                        </div>
                        <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                            推荐
                        </span>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-1">词转背诵</h3>
                    <p className="text-gray-500 text-sm mb-4">
                        智能记忆算法，词汇及词汇变形一网打尽。
                    </p>
                    <Link href="/dashboard/study" className="text-blue-600 font-semibold hover:underline text-sm flex items-center">
                        进入词转背诵 <TrendingUp className="w-4 h-4 ml-1" />
                    </Link>
                </div>

                {/* Practice Mode */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition cursor-pointer group">
                    <div className="flex items-center justify-between mb-4">
                        <div className="bg-green-50 p-3 rounded-lg group-hover:bg-green-100 transition">
                            <PenTool className="text-green-600 h-6 w-6" />
                        </div>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-1">专项练习</h3>
                    <p className="text-gray-500 text-sm mb-4">
                        针对性刷题，词转、语法、完形填空。
                    </p>
                    <div className="flex space-x-3 text-sm">
                        <Link href="/dashboard/practice?type=word_transformation" className="text-gray-600 hover:text-green-600 font-medium">
                            词转
                        </Link>
                        <span className="text-gray-300">|</span>
                        <Link href="/dashboard/practice?type=sentence_transformation" className="text-gray-600 hover:text-green-600 font-medium">
                            句转
                        </Link>
                        <span className="text-gray-300">|</span>
                        <Link href="/dashboard/practice?type=grammar" className="text-gray-600 hover:text-green-600 font-medium">
                            语法
                        </Link>
                    </div>
                </div>

                {/* Upload Mistakes */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition cursor-pointer group">
                    <div className="flex items-center justify-between mb-4">
                        <div className="bg-purple-50 p-3 rounded-lg group-hover:bg-purple-100 transition">
                            <Upload className="text-purple-600 h-6 w-6" />
                        </div>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-1">拍摄错题</h3>
                    <p className="text-gray-500 text-sm mb-4">
                        上传错题照片，OCR识别，自动归档。
                    </p>
                    <Link href="/dashboard/upload" className="text-purple-600 font-semibold hover:underline text-sm flex items-center">
                        立即上传 <Upload className="w-4 h-4 ml-1" />
                    </Link>
                </div>

                {/* Error Notebook */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition cursor-pointer group">
                    <div className="flex items-center justify-between mb-4">
                        <div className="bg-orange-50 p-3 rounded-lg group-hover:bg-orange-100 transition">
                            <AlertCircle className="text-orange-600 h-6 w-6" />
                        </div>
                        {studyStats.learning > 0 && (
                            <span className="text-xs font-bold text-white bg-red-500 px-2 py-1 rounded-full">
                                {studyStats.learning} 题待处理
                            </span>
                        )}
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-1">错题本</h3>
                    <p className="text-gray-500 text-sm mb-4">
                        查看错题分析，导出打印，消灭薄弱点。
                    </p>
                    <Link href="/dashboard/mistakes" className="text-orange-600 font-semibold hover:underline text-sm flex items-center">
                        查看错题 <AlertCircle className="w-4 h-4 ml-1" />
                    </Link>
                </div>
            </div>
        </div>
    )
}
