"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { Question, ImportHistory } from "@/types"
import { ArrowLeft, Cpu, Trash, Save, CheckCircle, AlertCircle } from "lucide-react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"

export default function ImportHistoryDetailPage() {
    const params = useParams()
    const router = useRouter()
    const historyId = params.id as string

    const [info, setInfo] = useState<ImportHistory | null>(null)
    const [questions, setQuestions] = useState<Question[]>([])
    const [loading, setLoading] = useState(true)

    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [statusMessage, setStatusMessage] = useState<string | null>(null)

    useEffect(() => {
        fetchDetails()
    }, [])

    const fetchDetails = async () => {
        setLoading(true)
        // 1. Fetch History Info
        const { data: historyData } = await supabase
            .from('import_history')
            .select('*')
            .eq('id', historyId)
            .single()

        if (historyData) setInfo(historyData)

        // 2. Fetch Questions
        const { data: qData } = await supabase
            .from('questions')
            .select('*')
            .eq('import_history_id', historyId)
            .order('id', { ascending: true }) // Keep original order if possible? ID usually chronol

        if (qData) setQuestions(qData)
        setLoading(false)
    }

    const handleDeleteAll = async () => {
        if (!confirm("确定要回滚这次导入吗？\n所有题目将被删除！")) return

        const { error } = await supabase
            .from('import_history')
            .delete()
            .eq('id', historyId)

        if (error) {
            alert("删除失败: " + error.message)
        } else {
            alert("已回滚")
            router.push('/admin/import/history')
        }
    }

    const handleAnalyzeAll = async () => {
        if (!confirm(`将对本批次 ${questions.length} 道题目进行 AI 分析 (跳过已分析的)。是否继续？`)) return

        setIsAnalyzing(true)

        // Filter pending
        const pending = questions//.filter(q => !q.is_ai_analyzed) // Analyze all to allow retry/refine

        if (pending.length === 0) {
            alert("没有需要分析的题目")
            setIsAnalyzing(false)
            return
        }

        try {
            const BATCH_SIZE = 5
            for (let i = 0; i < pending.length; i += BATCH_SIZE) {
                const batch = pending.slice(i, i + BATCH_SIZE)
                setStatusMessage(`分析进度: ${i + 1}/${pending.length}`)

                const items = batch.map(q => q.content)
                const res = await fetch('/api/ai/analyze', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items, mode: 'tagging' })
                })

                if (!res.ok) {
                    const errorText = await res.text()
                    throw new Error(`API Error (${res.status}): ${errorText}`)
                }

                const { results } = await res.json()

                const updates = results.map((r: any, idx: number) => {
                    const q = batch[idx]
                    const newTags = new Set(q.tags || [])
                    if (r.topic) newTags.add(`Topic:${r.topic}`)
                    if (r.key_point) newTags.add(`Point:${r.key_point}`)
                    if (r.difficulty) newTags.add(`Diff:${r.difficulty}`)

                    return {
                        id: q.id,
                        tags: Array.from(newTags),
                        answer: (!q.answer && r.answer) ? r.answer : q.answer,
                        is_ai_analyzed: true
                    }
                })

                const { error: updateError } = await supabase.from('questions').upsert(updates)

                if (updateError) {
                    console.error("Upsert failed:", updateError)
                    throw new Error("更新数据库失败: " + updateError.message)
                }

                // Update local state to reflect progress
                await new Promise(resolve => setTimeout(resolve, 500))
            }

            setStatusMessage("分析完成")
            fetchDetails()

        } catch (e: any) {
            alert("分析中断: " + e.message)
        } finally {
            setIsAnalyzing(false)
            setTimeout(() => setStatusMessage(null), 3000)
        }
    }

    if (loading) return <div className="p-8 text-center text-gray-500">加载中...</div>
    if (!info) return <div className="p-8 text-center text-red-500">记录不存在</div>

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <Link href="/admin/import/history" className="p-2 hover:bg-gray-100 rounded-full text-gray-500">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">{info.filename}</h2>
                        <p className="text-sm text-gray-500">
                            导入于 {new Date(info.import_date).toLocaleString()} · 共 {questions.length} 题
                        </p>
                    </div>
                </div>
                <div className="flex space-x-3">
                    <button
                        onClick={handleDeleteAll}
                        className="px-4 py-2 text-sm text-red-600 bg-red-50 hover:bg-red-100 rounded-lg flex items-center"
                    >
                        <Trash className="w-4 h-4 mr-2" /> 回滚删除
                    </button>
                    <button
                        onClick={handleAnalyzeAll}
                        disabled={isAnalyzing}
                        className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg flex items-center disabled:opacity-50"
                    >
                        <Cpu className="w-4 h-4 mr-2" />
                        {isAnalyzing ? '分析中...' : '全量 AI 分析'}
                    </button>
                </div>
            </div>

            {statusMessage && (
                <div className="bg-blue-50 text-blue-700 px-4 py-3 rounded-lg flex items-center animate-in slide-in-from-top-2">
                    <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full mr-2"></div>
                    {statusMessage}
                </div>
            )}

            {/* List */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase w-16">ID</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">题目内容</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase w-48">AI 分析状态</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {questions.map((q, i) => (
                            <tr key={q.id}>
                                <td className="px-6 py-4 text-xs text-gray-400">#{i + 1}</td>
                                <td className="px-6 py-4">
                                    <div className="text-sm text-gray-900 font-mono mb-1">{q.content}</div>
                                    <div className="flex flex-wrap gap-2 text-xs">
                                        <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-600">{q.type}</span>
                                        {q.tags.map(t => (
                                            <span key={t} className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded border border-indigo-100">{t}</span>
                                        ))}
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    {q.is_ai_analyzed ? (
                                        <span className="text-green-600 text-xs flex items-center font-medium">
                                            <CheckCircle className="w-3 h-3 mr-1" /> 已完成
                                        </span>
                                    ) : (
                                        <span className="text-gray-400 text-xs flex items-center">
                                            <AlertCircle className="w-3 h-3 mr-1" /> 待处理
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
