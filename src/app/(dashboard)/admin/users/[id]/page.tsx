"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
// import { useRouter } from "next/router" // Cannot use in App Router
import { useParams } from "next/navigation"
import { UserProfile } from "@/types"

export default function UserDetailPage() {
    const params = useParams()
    const userId = params?.id
    const [profile, setProfile] = useState<UserProfile | null>(null)

    const [stats, setStats] = useState({
        totalQuestions: 0,
        correctRate: 0,
        masteredCount: 0,
        learningCount: 0,
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

    const [recentActivity, setRecentActivity] = useState<any[]>([])
    const [weakWords, setWeakWords] = useState<any[]>([])

    useEffect(() => {
        if (userId) {
            fetchProfile()
            fetchStats()
            fetchAnalysis()
            fetchActivityAndWeakness()
        }
    }, [userId])

    const fetchActivityAndWeakness = async () => {
        // 1. Recent Quiz Activity
        const { data: activity } = await supabase
            .from('quiz_results')
            .select('*, questions(content)')
            .eq('user_id', userId)
            .order('attempt_at', { ascending: false })
            .limit(10)

        if (activity) setRecentActivity(activity)

        // 2. Weakest Words (High attempts, Learning status)
        const { data: weak } = await supabase
            .from('user_progress')
            .select('attempts, status, questions(content, answer)')
            .eq('user_id', userId)
            .eq('status', 'learning')
            .order('attempts', { ascending: false })
            .limit(10)

        if (weak) setWeakWords(weak)
    }

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
            .select('is_correct, attempt_at')
            .eq('user_id', userId)
            .order('attempt_at', { ascending: false })

        let total = 0
        let correct = 0
        let lastActive = '从未活跃'

        if (quizData && quizData.length > 0) {
            total = quizData.length
            correct = quizData.filter(q => q.is_correct).length
            lastActive = new Date(quizData[0].attempt_at).toLocaleString('zh-CN')
        }

        // 2. Study Progress (Mastered words/questions)
        const { count: masteredCount } = await supabase
            .from('user_progress')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('status', 'mastered')

        // 3. Learning Count
        const { count: learningCount } = await supabase
            .from('user_progress')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('status', 'learning')

        setStats({
            totalQuestions: total,
            correctRate: total > 0 ? Math.round((correct / total) * 100) : 0,
            masteredCount: masteredCount || 0,
            learningCount: learningCount || 0,
            lastActive
        })
        setLoading(false)
    }

    const handleResetPassword = async () => {
        const newPassword = prompt("请输入新密码 (至少6个字符):")
        if (!newPassword) return
        if (newPassword.length < 6) {
            alert("密码至少需要6个字符")
            return
        }

        try {
            const { data: { session } } = await supabase.auth.getSession()
            const res = await fetch('/api/admin/reset-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({ userId, newPassword })
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || '重置失败')
            }

            alert("密码已成功重置！")
        } catch (e: any) {
            alert("重置失败: " + e.message)
        }
    }

    const handleDeleteUser = async () => {
        if (!profile) return

        // First confirmation
        const confirmUsername = prompt(
            `⚠️ 危险操作：删除用户将永久删除所有数据！\n\n` +
            `包括：练习记录、学习进度、错题本、用户资料等。\n\n` +
            `请输入用户名 "${profile.username}" 以确认删除：`
        )

        if (confirmUsername !== profile.username) {
            if (confirmUsername !== null) {
                alert("用户名不匹配，已取消删除")
            }
            return
        }

        // Second confirmation
        const finalConfirm = confirm(
            `最后确认：确定要删除用户 "${profile.username}" 及其所有数据吗？\n\n此操作不可撤销！`
        )

        if (!finalConfirm) return

        try {
            const { data: { session } } = await supabase.auth.getSession()
            const res = await fetch('/api/admin/delete-user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({ userId })
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || '删除失败')
            }

            alert("用户已成功删除！")
            window.location.href = '/admin/users'
        } catch (e: any) {
            alert("删除失败: " + e.message)
        }
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
                <div className="flex space-x-3">
                    <button
                        onClick={handleResetPassword}
                        className="bg-orange-600 text-white px-4 py-2 rounded text-sm hover:bg-orange-700 shadow-sm"
                    >
                        重置密码
                    </button>
                    <button
                        onClick={handleDeleteUser}
                        className="bg-red-600 text-white px-4 py-2 rounded text-sm hover:bg-red-700 shadow-sm border-2 border-red-700"
                    >
                        删除用户
                    </button>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-gray-500 text-sm font-medium">累计答题次数</h3>
                    <p className="text-3xl font-bold text-indigo-600 mt-2">{stats.totalQuestions}</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-gray-500 text-sm font-medium" title="计算逻辑: 累计答对总题数 ÷ 累计答题总次数 × 100%">综合正确率 <span className="text-xs text-gray-400 font-normal cursor-help">(?)</span></h3>
                    <p className="text-3xl font-bold text-green-600 mt-2" title={`具体数据: 答对 ${Math.round((stats.correctRate / 100) * stats.totalQuestions)} 题 / 共答 ${stats.totalQuestions} 题`}>{stats.correctRate}%</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-gray-500 text-sm font-medium">掌握进度 (累计掌握 / 正在学习)</h3>
                    <p className="text-3xl font-bold text-blue-600 mt-2">
                        {stats.masteredCount} <span className="text-sm text-gray-400">/ {stats.learningCount}</span>
                    </p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-gray-500 text-sm font-medium">最近活跃</h3>
                    <p className="text-md font-medium text-gray-700 mt-3">{stats.lastActive}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Weak Words */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">高频错词 (Top 10)</h3>
                    <div className="space-y-3">
                        {weakWords.length === 0 ? (
                            <p className="text-gray-500 text-sm">暂无高频错词数据</p>
                        ) : (
                            weakWords.map((w, idx) => (
                                <div key={idx} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
                                    <div>
                                        <p className="font-medium text-gray-800">{w.questions?.content}</p>
                                        <p className="text-xs text-gray-500">{w.questions?.answer}</p>
                                    </div>
                                    <span className="text-xs font-bold bg-red-100 text-red-600 px-2 py-1 rounded-full">
                                        练习 {w.attempts} 次
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Recent Activity */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">最近练习记录</h3>
                    <div className="space-y-3">
                        {recentActivity.length === 0 ? (
                            <p className="text-gray-500 text-sm">暂无练习记录</p>
                        ) : (
                            recentActivity.map((a, idx) => (
                                <div key={idx} className="flex justify-between items-center text-sm border-b border-gray-100 pb-2 last:border-0">
                                    <div className="truncate max-w-[70%]">
                                        <span className={`mr-2 ${a.is_correct ? 'text-green-500' : 'text-red-500'}`}>
                                            {a.is_correct ? '●' : '●'}
                                        </span>
                                        <span className="text-gray-700 truncate" title={a.questions?.content}>
                                            {a.questions?.content?.substring(0, 30)}...
                                        </span>
                                    </div>
                                    <span className="text-gray-400 text-xs">
                                        {new Date(a.attempt_at).toLocaleDateString()}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
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
