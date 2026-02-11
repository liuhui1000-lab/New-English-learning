"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { UserProfile } from "@/types"

export default function ProfilePage() {
    const [profile, setProfile] = useState<UserProfile | null>(null)
    const [password, setPassword] = useState("")
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        fetchMe()
    }, [])

    const fetchMe = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
            const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
            if (data) setProfile(data)
        }
    }

    const handleUpdatePassword = async () => {
        setLoading(true)
        const { error } = await supabase.auth.updateUser({ password: password })
        if (error) alert("修改失败: " + error.message)
        else {
            alert("密码修改成功！")
            setPassword("")
        }
        setLoading(false)
    }

    if (!profile) return <div>加载中...</div>

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <h2 className="text-2xl font-bold text-gray-900">个人中心</h2>

            <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-medium mb-4">基本信息</h3>
                <p><strong>用户名:</strong> {profile.username}</p>
                <p><strong>角色:</strong> {profile.role}</p>
                <p><strong>状态:</strong> {profile.status === 'active' ? '正常' : '待审核'}</p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-medium mb-4">修改密码</h3>
                <div className="flex gap-4 items-end">
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700">新密码</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2"
                        />
                    </div>
                    <button
                        onClick={handleUpdatePassword}
                        disabled={loading || !password}
                        className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 disabled:opacity-50"
                    >
                        {loading ? "提交中..." : "修改密码"}
                    </button>
                </div>
            </div>

            {/* Reusing stats component in future */}
            <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-medium mb-4">我的学习数据</h3>
                <p className="text-gray-500">暂无数据...</p>
            </div>
        </div>
    )
}
