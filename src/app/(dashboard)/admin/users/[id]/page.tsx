"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
// import { useRouter } from "next/router" // Cannot use in App Router
import { useParams } from "next/navigation"
import { UserProfile } from "@/types"

export default function UserDetailPage() {
    const params = useParams()
    const userId = params?.id

    const [stats, setStats] = useState({
        totalQuestions: 0,
        correctRate: 0,
        masteredCount: 0,
        lastActive: '从未活跃'
    })
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (userId) {
            fetchProfile()
            fetchStats()
        }
    }, [userId])

    const fetchProfile = async () => {
        const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
        if (data) setProfile(data)
    }

    const [analysisData, setAnalysisData] = useState<{
        latestReport: any | null,
        newMistakesCount: number,
        lastAnalyzedAt: string | null
    }>({
        latestReport: null,
        newMistakesCount: 0,
        lastAnalyzedAt: null
    })
    const [analyzing, setAnalyzing] = useState(false)

    useEffect(() => {
        if (userId) {
            fetchProfile()
            fetchStats()
            fetchAnalysis()
        }
    }, [userId])

    const fetchAnalysis = async () => {
        try {
            const res = await fetch(`/api/ai/analyze-errors?userId=${userId}`)
            if (res.ok) {
                const data = await res.json()
                setAnalysisData({
                    latestReport: data.latestReport,
                    newMistakesCount: data.newMistakesCount,
                    lastAnalyzedAt: data.latestReport?.created_at || null
                })
            }
        } catch (e) {
            console.error("Fetch analysis failed", e)
        }
    }

    const handleAnalyzeErrors = async () => {
        if (!confirm("确定要对该学员进行 AI 错题分析吗？这将消耗 API Token。")) return
        setAnalyzing(true)
        try {
            const res = await fetch('/api/ai/analyze-errors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            })

            if (!res.ok) {
                const err = await res.text()
                throw new Error(err)
            }

            const data = await res.json()
            alert("分析完成！")
            fetchAnalysis() // Refresh
        } catch (e: any) {
            alert("分析失败: " + e.message)
        } finally {
            setAnalyzing(false)
        }
    }

    const fetchStats = async () => {
        setLoading(true)

        // 1. Quiz Results (Total answered & Accuracy)
        const { data: quizData } = await supabase
            .from('quiz_results')
            .select('is_correct, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })

        let total = 0
        let correct = 0
        let lastActive = '从未活跃'

        if (quizData && quizData.length > 0) {
            total = quizData.length
            correct = quizData.filter(q => q.is_correct).length
            lastActive = new Date(quizData[0].created_at).toLocaleString('zh-CN')
        }

        // 2. Study Progress (Mastered words/questions)
        const { count: masteredCount } = await supabase
            .from('user_progress')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('status', 'mastered')

        setStats({
            totalQuestions: total,
            correctRate: total > 0 ? Math.round((correct / total) * 100) : 0,
            masteredCount: masteredCount || 0,
            lastActive
        })
        setLoading(false)
    }

    const handleResetPassword = async () => {
        const newPassword = prompt("请输入新密码:")
        if (!newPassword) return

        const { error } = await supabase.auth.admin.updateUserById(
            userId as string,
            { password: newPassword }
        )

        if (error) alert("重置失败: " + error.message)
        else alert("密码已重置")
    }

    if (!profile) return <div className="p-8">加载中...</div>

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">{profile.username} 的学习档案</h2>
                    <p className="text-sm text-gray-500">
                        {profile.role === 'admin' ? '管理员' : '学生'} •
                        <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${profile.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                            {profile.status === 'active' ? '正常' : '冻结/待审'}
                        </span>
                    </p>
                </div>
                <button
                    onClick={handleResetPassword}
                    className="bg-red-600 text-white px-4 py-2 rounded text-sm hover:bg-red-700 shadow-sm"
                >
                    重置密码
                </button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-gray-500 text-sm font-medium">总做题数</h3>
                    <p className="text-3xl font-bold text-indigo-600 mt-2">{stats.totalQuestions}</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-gray-500 text-sm font-medium">正确率</h3>
                    <p className="text-3xl font-bold text-green-600 mt-2">{stats.correctRate}%</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-gray-500 text-sm font-medium">已掌握 (Mastered)</h3>
                    <p className="text-3xl font-bold text-blue-600 mt-2">{stats.masteredCount}</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-gray-500 text-sm font-medium">最近活跃</h3>
                    <p className="text-md font-medium text-gray-700 mt-3">{stats.lastActive}</p>
                </div>
            </div>

            {/* Detailed Activity Placeholder */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-gray-900">AI 错题诊断分析</h3>
                    <div className="flex items-center space-x-3">
                        <span className="text-sm text-gray-500">
                            {analysisData.lastAnalyzedAt ?
                                `上次分析: ${new Date(analysisData.lastAnalyzedAt).toLocaleString('zh-CN')}` :
                                '从未进行过 AI 分析'}
                        </span>
                        {analysisData.newMistakesCount > 0 && (
                            <span className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded-full font-medium">
                                +{analysisData.newMistakesCount} 新错题
                            </span>
                        )}
                        <button
                            onClick={handleAnalyzeErrors}
                            disabled={analyzing}
                            className="bg-indigo-600 text-white px-4 py-2 rounded text-sm hover:bg-indigo-700 disabled:opacity-50 flex items-center"
                        >
                            {analyzing ? '分析中...' : '立即分析'}
                        </button>
                    </div>
                </div>

                {analysisData.latestReport ? (
                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-100 prose prose-sm max-w-none">
                        <pre className="whitespace-pre-wrap font-sans bg-transparent text-gray-800 p-0 m-0">
                            {analysisData.latestReport.report_content}
                        </pre>
                    </div>
                ) : (
                    <div className="text-center py-10 bg-gray-50 rounded-lg border border-dashed border-gray-300 text-gray-500">
                        暂无分析报告，请点击右上角按钮生成。
                    </div>
                )}
            </div>
        </div>
    )
}
