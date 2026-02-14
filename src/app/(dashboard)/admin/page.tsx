"use client"

import { useEffect, useState } from "react"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { UserProfile } from "@/types"
import { Search, MoreVertical, TrendingUp, AlertTriangle, Settings } from "lucide-react"
import Link from "next/link"

export default function AdminDashboardPage() {
    const [students, setStudents] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const supabase = createClientComponentClient()

    useEffect(() => {
        fetchStudents()
    }, [])

    const fetchStudents = async () => {
        setLoading(true)

        // 1. Fetch Student Profiles
        const { data: profiles } = await supabase
            .from('profiles')
            .select('*')
            .eq('role', 'student') // Assuming 'role' column exists or we filter client side
            .order('last_login', { ascending: false })

        if (!profiles) {
            setLoading(false)
            return
        }

        // 2. Fetch Progress Stats for EACH student
        // In a real app, this should be a VIEW or an Edge Function to avoid N+1 queries
        // But for MVP with < 50 users, parallel queries are "okay".
        const studentsWithStats = await Promise.all(profiles.map(async (profile: any) => {
            // Count Mastered Words
            const { count: masteredCount } = await supabase
                .from('user_progress')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', profile.id)
                .eq('status', 'mastered')

            // Count Quiz Errors (Last 7 days?) -> Just total errors for now
            const { count: errorCount } = await supabase
                .from('quiz_results')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', profile.id)
                .eq('is_correct', false)

            return {
                ...profile,
                stats: {
                    mastered: masteredCount || 0,
                    errors: errorCount || 0
                }
            }
        }))

        setStudents(studentsWithStats)
        setLoading(false)
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">学员管理看板</h2>
                <div className="flex items-center space-x-4">
                    <Link
                        href="/admin/settings"
                        className="text-gray-500 hover:text-indigo-600 flex items-center text-sm font-medium transition"
                    >
                        <Settings className="w-4 h-4 mr-1" />
                        系统设置
                    </Link>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="搜索学员..."
                            className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-20 bg-gray-50 animate-pulse rounded-lg" />
                    ))}
                </div>
            ) : (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">学员</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">背诵进度</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">错题累计</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">最近活跃</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {students.map((student) => (
                                <tr key={student.id} className="hover:bg-gray-50 transition">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div className="flex-shrink-0 h-10 w-10">
                                                <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                                                    {student.display_name?.[0]?.toUpperCase() || student.username?.[0]?.toUpperCase()}
                                                </div>
                                            </div>
                                            <div className="ml-4">
                                                <div className="text-sm font-medium text-gray-900">{student.display_name || '未命名'}</div>
                                                <div className="text-sm text-gray-500">{student.username}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <TrendingUp className="w-4 h-4 text-green-500 mr-2" />
                                            <span className="text-sm text-gray-900 font-bold">{student.stats.mastered}</span>
                                            <span className="text-xs text-gray-500 ml-1">词已掌握</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <AlertTriangle className={`w-4 h-4 mr-2 ${student.stats.errors > 10 ? 'text-red-500' : 'text-orange-300'}`} />
                                            <span className="text-sm text-gray-900">{student.stats.errors}</span>
                                            <span className="text-xs text-gray-500 ml-1">次错误</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {student.last_login ? new Date(student.last_login).toLocaleDateString() : '从未登录'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <Link href={`/admin/student/${student.id}`} className="text-indigo-600 hover:text-indigo-900">
                                            查看详情
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
