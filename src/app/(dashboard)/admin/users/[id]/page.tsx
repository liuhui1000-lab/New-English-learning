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

    // Stats Mock Data (Replace with real aggregation later)
    const stats = {
        wordTrans: 85,
        collocation: 60,
        grammar: 40,
        totalQuestions: 120,
        totalTime: '5h 30m'
    }

    useEffect(() => {
        if (userId) fetchProfile()
    }, [userId])

    const fetchProfile = async () => {
        const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
        if (data) setProfile(data)
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

    if (!profile) return <div>Loading...</div>

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">{profile.username} 的学习档案</h2>
                <button
                    onClick={handleResetPassword}
                    className="bg-red-600 text-white px-4 py-2 rounded text-sm hover:bg-red-700"
                >
                    重置密码
                </button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-lg shadow text-center">
                    <h3 className="text-gray-500 text-sm font-medium">总做题数</h3>
                    <p className="text-3xl font-bold text-indigo-600 mt-2">{stats.totalQuestions}</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow text-center">
                    <h3 className="text-gray-500 text-sm font-medium">学习时长</h3>
                    <p className="text-3xl font-bold text-green-600 mt-2">{stats.totalTime}</p>
                </div>
                {/* Radar Chart Placeholder */}
                <div className="bg-white p-6 rounded-lg shadow row-span-2 flex flex-col items-center justify-center">
                    <h3 className="text-gray-900 font-bold mb-4">能力雷达图</h3>
                    <div className="w-48 h-48 bg-gray-100 rounded-full flex items-center justify-center relative">
                        <span className="text-xs text-gray-500">词汇转换: {stats.wordTrans}</span>
                        <span className="absolute top-2 text-xs text-gray-500">语法: {stats.grammar}</span>
                        <span className="absolute bottom-2 text-xs text-gray-500">固搭: {stats.collocation}</span>
                        {/* Integrate Chart.js or Recharts here */}
                    </div>
                </div>
            </div>
        </div>
    )
}
