"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Users, Settings, BookOpen, Layers, UploadCloud, Menu, X } from "lucide-react"
import SignOutButton from "@/components/SignOutButton"
import { supabase } from "@/lib/supabase"

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const [isAdmin, setIsAdmin] = useState(false)
    const [loading, setLoading] = useState(true)
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    useEffect(() => {
        const fetchRole = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser()
                console.log('Current user:', user?.id)

                if (user) {
                    const { data: profile, error } = await supabase
                        .from('profiles')
                        .select('role')
                        .eq('id', user.id)
                        .single()

                    console.log('Profile data:', profile)
                    console.log('Profile error:', error)

                    if (error) {
                        console.error('Failed to fetch profile:', error)
                        // If RLS blocks the query, assume not admin
                        setIsAdmin(false)
                    } else {
                        setIsAdmin(profile?.role === 'admin')
                        console.log('Is admin:', profile?.role === 'admin')
                    }
                }
            } catch (e) {
                console.error('Error in fetchRole:', e)
                setIsAdmin(false)
            } finally {
                setLoading(false)
            }
        }
        fetchRole()
    }, [])

    return (
        <div className="flex h-screen bg-gray-100">
            {/* Mobile Menu Button */}
            <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-md shadow-md"
            >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>

            {/* Mobile Overlay */}
            {mobileMenuOpen && (
                <div
                    className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
                    onClick={() => setMobileMenuOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`
                w-64 bg-white shadow-md
                fixed md:static inset-y-0 left-0 z-40
                transform transition-transform duration-300 ease-in-out
                ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
            `}>
                <div className="p-6">
                    <h1 className="text-2xl font-bold text-indigo-600">English App</h1>
                </div>
                <nav className="mt-6 px-4 space-y-2">
                    <Link
                        href="/dashboard"
                        className="flex items-center px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
                        onClick={() => setMobileMenuOpen(false)}
                    >
                        <BookOpen className="mr-3 h-5 w-5" />
                        学习中心
                    </Link>

                    {isAdmin && (
                        <>
                            <div className="pt-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                管理员
                            </div>
                            <Link
                                href="/admin/import"
                                className="flex items-center px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
                                onClick={() => setMobileMenuOpen(false)}
                            >
                                <UploadCloud className="mr-3 h-5 w-5" />
                                快速导入
                            </Link>
                            <Link
                                href="/admin/questions"
                                className="flex items-center px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
                                onClick={() => setMobileMenuOpen(false)}
                            >
                                <BookOpen className="mr-3 h-5 w-5" />
                                内容题库
                            </Link>
                            <Link
                                href="/admin/users"
                                className="flex items-center px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
                                onClick={() => setMobileMenuOpen(false)}
                            >
                                <Users className="mr-3 h-5 w-5" />
                                用户管理
                            </Link>
                            <Link
                                href="/admin/settings"
                                className="flex items-center px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
                                onClick={() => setMobileMenuOpen(false)}
                            >
                                <Settings className="mr-3 h-5 w-5" />
                                系统设置
                            </Link>
                        </>
                    )}

                    <Link
                        href="/dashboard/profile"
                        className="flex items-center px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
                        onClick={() => setMobileMenuOpen(false)}
                    >
                        <Layers className="mr-3 h-5 w-5" />
                        个人中心
                    </Link>

                    <div className="pt-4 mt-auto border-t border-gray-200">
                        <SignOutButton />
                    </div>
                </nav>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto p-4 md:p-8 pt-16 md:pt-8">
                {children}
            </main>
        </div>
    )
}
