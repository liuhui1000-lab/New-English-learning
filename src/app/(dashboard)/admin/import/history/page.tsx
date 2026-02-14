"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { ImportHistory } from "@/types"
import { Trash, Calendar, FileText, AlertTriangle } from "lucide-react"

export default function ImportHistoryPage() {
    const [history, setHistory] = useState<ImportHistory[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchHistory()
    }, [])

    const fetchHistory = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('import_history')
            .select('*')
            .order('import_date', { ascending: false })

        if (data) {
            setHistory(data as ImportHistory[])
        }
        setLoading(false)
    }

    const handleDelete = async (id: string) => {
        if (!confirm("确定要删除这条导入记录吗？\n警告：该次导入的所有题目都将被删除！已产生的学习记录也会消失。")) {
            return
        }

        const { error } = await supabase
            .from('import_history')
            .delete()
            .eq('id', id)

        if (error) {
            alert("删除失败: " + error.message)
        } else {
            alert("已回滚该次导入")
            setHistory(history.filter(h => h.id !== id))
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">导入历史 & 回滚</h2>
            </div>

            <div className="bg-white shadow overflow-hidden rounded-md">
                <ul className="divide-y divide-gray-200">
                    {history.map((item) => (
                        <li key={item.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                            <div className="flex items-center space-x-4 flex-1">
                                <Link href={`/admin/import/history/${item.id}`} className="flex items-center flex-1 cursor-pointer group">
                                    <div className="flex-shrink-0">
                                        <FileText className="h-8 w-8 text-gray-400 group-hover:text-indigo-500 transition" />
                                    </div>
                                    <div className="ml-4">
                                        <p className="text-sm font-medium text-gray-900 group-hover:text-indigo-600 transition">
                                            {item.filename}
                                        </p>
                                        <div className="flex items-center space-x-2 text-xs text-gray-500">
                                            <Calendar className="h-3 w-3 mr-1" />
                                            {new Date(item.import_date).toLocaleString()}
                                            <span className="mx-1">|</span>
                                            <span>共 {item.question_count} 题</span>
                                        </div>
                                    </div>
                                </Link>
                            </div>

                            <div>
                                <button
                                    onClick={() => handleDelete(item.id)}
                                    className="flex items-center text-red-600 hover:text-red-900 text-sm font-medium"
                                >
                                    <Trash className="w-4 h-4 mr-1" />
                                    回滚删除
                                </button>
                            </div>
                        </li>
                    ))}
                    {history.length === 0 && !loading && (
                        <li className="p-8 text-center text-gray-500">
                            暂无导入记录
                        </li>
                    )}
                </ul>
            </div>
        </div>
    )
}
