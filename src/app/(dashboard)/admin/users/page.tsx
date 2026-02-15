"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { UserProfile, UserStatus } from "@/types"
import { CheckCircle, XCircle, Ban, ShieldAlert } from "lucide-react"
import Link from "next/link"

export default function UserManagementPage() {
    const [users, setUsers] = useState<UserProfile[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchUsers()
    }, [])

    const fetchUsers = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false })

        if (data) {
            setUsers(data as UserProfile[])
        }
        setLoading(false)
    }

    const handleStatusChange = async (userId: string, newStatus: UserStatus) => {
        const { error } = await supabase
            .from('profiles')
            .update({ status: newStatus })
            .eq('id', userId)

        if (error) {
            console.error('Status update failed:', error)
            alert(`操作失败: ${error.message}\n\n可能是数据库权限问题，请联系管理员检查 RLS 策略。`)
            return
        }

        setUsers(users.map(u => u.id === userId ? { ...u, status: newStatus } : u))
        alert('状态更新成功')
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active': return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">正常</span>
            case 'pending': return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">待审核</span>
            case 'frozen': return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">已冻结</span>
            default: return null
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">用户管理</h2>
            </div>

            <div className="bg-white shadow overflow-hidden rounded-md">
                <ul className="divide-y divide-gray-200">
                    {users.map((user) => (
                        <li key={user.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                            <div className="flex items-center space-x-4">
                                <div className="flex-shrink-0">
                                    <span className="inline-block h-10 w-10 rounded-full overflow-hidden bg-gray-100 text-center leading-10 font-bold text-gray-500">
                                        {user.username?.charAt(0).toUpperCase()}
                                    </span>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-gray-900">
                                        <Link href={`/admin/users/${user.id}`} className="hover:underline text-indigo-600">
                                            {user.username}
                                        </Link>
                                    </p>
                                    <div className="flex items-center space-x-2">
                                        {getStatusBadge(user.status)}
                                        <span className="text-xs text-gray-500">
                                            注册于: {new Date(user.created_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex space-x-2">
                                {user.status === 'pending' && (
                                    <>
                                        <button
                                            onClick={() => handleStatusChange(user.id, 'active')}
                                            className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded text-green-700 bg-green-100 hover:bg-green-200"
                                        >
                                            <CheckCircle className="mr-1 h-4 w-4" /> 批准
                                        </button>
                                        <button
                                            onClick={() => handleStatusChange(user.id, 'frozen')} // Rejecting effectively freezes or we could delete
                                            className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded text-red-700 bg-red-100 hover:bg-red-200"
                                        >
                                            <XCircle className="mr-1 h-4 w-4" /> 拒绝
                                        </button>
                                    </>
                                )}

                                {user.status === 'active' && (
                                    <button
                                        onClick={() => handleStatusChange(user.id, 'frozen')}
                                        className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded text-red-700 bg-red-100 hover:bg-red-200"
                                    >
                                        <Ban className="mr-1 h-4 w-4" /> 冻结
                                    </button>
                                )}

                                {user.status === 'frozen' && (
                                    <button
                                        onClick={() => handleStatusChange(user.id, 'active')}
                                        className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded text-green-700 bg-green-100 hover:bg-green-200"
                                    >
                                        <CheckCircle className="mr-1 h-4 w-4" /> 解冻
                                    </button>
                                )}
                            </div>
                        </li>
                    ))}
                    {users.length === 0 && !loading && (
                        <li className="p-4 text-center text-gray-500">暂无用户</li>
                    )}
                </ul>
            </div>
        </div>
    )
}
