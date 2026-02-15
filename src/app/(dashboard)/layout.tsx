"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Users, Settings, BookOpen, Layers, UploadCloud } from "lucide-react"
import SignOutButton from "@/components/SignOutButton"
import { supabase } from "@/lib/supabase"

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const [isAdmin, setIsAdmin] = useState(false)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchRole = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', user.id)
                    .single()

                setIsAdmin(profile?.role === 'admin')
            }
            setLoading(false)
        }
        fetchRole()
    }, [])

    return (
        <div className="flex h-screen bg-gray-100">
            {/* Sidebar */}
            <aside className="w-64 bg-white shadow-md hidden md:block">
                <div className="p-6">
                    <h1 className="text-2xl font-bold text-indigo-600">English App</h1>
                </div>
                <nav className="mt-6 px-4 space-y-2">
                    <Link href="/dashboard" className="flex items-center px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md">
                        <BookOpen className="mr-3 h-5 w-5" />
                        学习中心
                    </Link>

                    {isAdmin && (
                        <>
                            <div className="pt-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                管理员
                            </div>
                            <Link href="/admin/import" className="flex items-center px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md">
                                <UploadCloud className="mr-3 h-5 w-5" />
                                快速导入
                            </Link>
                            <Link href="/admin/questions" className="flex items-center px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md">
                                <BookOpen className="mr-3 h-5 w-5" />
                                内容题库
                            </Link>
                            <Link href="/admin/users" className="flex items-center px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md">
                                <Users className="mr-3 h-5 w-5" />
                                用户管理
                            </Link>
                            <Link href="/admin/settings" className="flex items-center px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md">
                                <Settings className="mr-3 h-5 w-5" />
                                系统设置
                            </Link>
                        </>
                    )}

                    <Link href="/dashboard/profile" className="flex items-center px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md">
                        <Layers className="mr-3 h-5 w-5" />
                        个人中心
                    </Link>

                    <div className="pt-4 mt-auto border-t border-gray-200">
                        <SignOutButton />
                    </div>
                </nav>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto p-8">
                {children}
            </main>
        </div>
    )
}
