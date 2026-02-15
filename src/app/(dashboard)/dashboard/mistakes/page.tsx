"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { FileDown, AlertTriangle, CheckCircle, RefreshCw, Trash } from "lucide-react"

export default function ErrorNotebookPage() {
    const [mistakes, setMistakes] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<'all' | 'recitation' | 'quiz'>('all')
    const [sort, setSort] = useState<'date_desc' | 'date_asc' | 'count_desc' | 'az_asc'>('date_desc')

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    useEffect(() => {
        fetchMistakes()
    }, [])

    const fetchMistakes = async () => {
        setLoading(true)
        const allMistakes: any[] = []

        // 1. Fetch Recitation Mistakes (Learning status implies not mastered)
        // Or better: fetch items with HIGH attempt count but low success?
        // Let's use current simple logic: status = 'learning' AND attempts > 0
        const { data: recitationData } = await supabase
            .from('user_progress')
            .select(`
                *,
                questions (
                    id, content, answer, type
                )
            `)
            .eq('status', 'learning')
            .gt('attempts', 0)

        if (recitationData) {
            recitationData.forEach((record: any) => {
                allMistakes.push({
                    id: record.questions.id,
                    content: record.questions.content,
                    answer: record.questions.answer,
                    type: 'recitation',
                    note: 'Spelling / Memory',
                    count: record.attempts // Approximation of struggles
                })
            })
        }

        // 2. Fetch Quiz Mistakes
        // Group by question_id to count errors?
        // For V1, let's just show latest distinct errors
        const { data: quizData } = await supabase
            .from('quiz_results')
            .select(`
                *,
                questions (
                    id, content, answer, type, explanation
                )
            `)
            .eq('is_correct', false)
            .order('attempt_at', { ascending: false })
            .limit(50)

        if (quizData) {
            quizData.forEach((record: any) => {
                // Deduplicate if already added?
                if (!allMistakes.find(m => m.id === record.questions.id)) {
                    allMistakes.push({
                        id: record.questions.id,
                        row_id: record.id, // Primary key for deletion
                        content: record.questions.content,
                        answer: record.questions.answer,
                        type: 'quiz',
                        note: record.questions.type === 'grammar' ? 'Grammar' : 'Collocation',
                        count: 1,
                        explanation: record.questions.explanation,
                        lastAttempt: record.attempt_at
                    })
                }
            })
        }

        setMistakes(allMistakes)
        setLoading(false)
    }

    const filteredMistakes = mistakes
        .filter(m => filter === 'all' || m.type === filter)
        .sort((a, b) => {
            switch (sort) {
                case 'date_desc':
                    return new Date(b.lastAttempt || 0).getTime() - new Date(a.lastAttempt || 0).getTime()
                case 'date_asc':
                    return new Date(a.lastAttempt || 0).getTime() - new Date(b.lastAttempt || 0).getTime()
                case 'count_desc':
                    return b.count - a.count
                case 'az_asc':
                    return a.content.localeCompare(b.content)
                default:
                    return 0
            }
        })

    const [analyzing, setAnalyzing] = useState(false)
    const [report, setReport] = useState<string | null>(null)

    const handlePrint = () => {
        window.print()
    }

    const handleAnalyze = async () => {
        if (filteredMistakes.length === 0) {
            alert("请先筛选出需要分析的错题")
            return
        }
        if (!confirm(`即将分析当前列表中的 ${filteredMistakes.length} 道错题。可能需要几十秒钟，请耐心等待。`)) return

        setAnalyzing(true)
        setReport(null)
        try {
            // Limit to top 20 to avoid token limits
            const subset = filteredMistakes.slice(0, 20)
            const res = await fetch('/api/ai/analyze-errors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mistakes: subset })
            })

            if (!res.ok) throw new Error(await res.text())

            const data = await res.json()
            setReport(data.report)
        } catch (e: any) {
            alert("分析失败: " + e.message)
        } finally {
            setAnalyzing(false)
        }
    }

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

    // Actions
    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            const newSet = new Set<string>()
            filteredMistakes.forEach(m => newSet.add(m.id))
            setSelectedIds(newSet)
        } else {
            setSelectedIds(new Set())
        }
    }

    const handleSelectOne = (id: string) => {
        const newSet = new Set(selectedIds)
        if (newSet.has(id)) newSet.delete(id)
        else newSet.add(id)
        setSelectedIds(newSet)
    }

    const handleDelete = async (mode: 'selected' | 'all') => {
        const targets = mode === 'selected' ? filteredMistakes.filter(m => selectedIds.has(m.id)) : filteredMistakes
        if (targets.length === 0) return

        const confirmMsg = mode === 'all'
            ? `确定要清空当前的 ${targets.length} 条错题记录吗？`
            : `确定要删除选中的 ${targets.length} 条错题记录吗？`

        if (!confirm(confirmMsg)) return

        setLoading(true)
        try {
            // Group by type for efficient deletion
            const quizIds = targets.filter(m => m.type === 'quiz').map(m => m.row_id) // We need row_id for quiz_results unique deletion
            const recitationIds = targets.filter(m => m.type === 'recitation').map(m => m.id) // question_id for user_progress

            // 1. Delete Quiz Results (Hard Delete)
            if (quizIds.length > 0) {
                const { error } = await supabase
                    .from('quiz_results')
                    .delete()
                    .in('id', quizIds)
                if (error) throw error
            }

            // 2. Reset Recitation Progress (Soft Delete / Reset)
            if (recitationIds.length > 0) {
                const { data: { user } } = await supabase.auth.getUser()
                if (user) {
                    // Update to 'mastered' or just reset attempts? 
                    // Analyzed requirement: "Remove from mistake list". 
                    // Resetting attempts to 0 removes it from "mistakes" (since we filter by attempts > 0)
                    // But maybe we should just set status to 'reviewing' and attempts=0
                    const { error } = await supabase
                        .from('user_progress')
                        .update({ attempts: 0, status: 'reviewing', next_review_at: new Date().toISOString() })
                        .in('question_id', recitationIds)
                        .eq('user_id', user.id)

                    if (error) throw error
                }
            }

            alert("删除成功")
            setSelectedIds(new Set())
            fetchMistakes()

        } catch (e: any) {
            console.error(e)
            alert("操作失败: " + e.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
                <h2 className="text-2xl font-bold text-gray-900">我的错题本</h2>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Bulk Actions */}
                    {selectedIds.size > 0 && (
                        <div className="flex items-center bg-red-50 px-3 py-1.5 rounded-lg border border-red-100 animate-in fade-in">
                            <span className="text-sm text-red-700 mr-3 font-medium">已选 {selectedIds.size} 项</span>
                            <button
                                onClick={() => handleDelete('selected')}
                                className="text-xs bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 flex items-center shadow-sm"
                            >
                                <Trash className="w-3 h-3 mr-1" /> 删除选中
                            </button>
                        </div>
                    )}

                    <div className="h-6 w-px bg-gray-200 hidden md:block"></div>

                    <button
                        onClick={handleAnalyze}
                        disabled={analyzing}
                        className="bg-indigo-600 text-white hover:bg-indigo-700 border border-transparent px-4 py-2 rounded-lg flex items-center shadow-sm transition disabled:opacity-50 text-sm font-medium"
                    >
                        {analyzing ? (
                            <>
                                <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> 分析中...
                            </>
                        ) : (
                            <>
                                <CheckCircle className="w-4 h-4 mr-2" /> 智能分析
                            </>
                        )}
                    </button>

                    <button
                        onClick={() => handleDelete('all')}
                        className="bg-white border border-gray-300 text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg flex items-center shadow-sm transition text-sm"
                        title="清空当前列表"
                    >
                        <Trash className="w-4 h-4 mr-1" /> 清空
                    </button>

                    <button
                        onClick={fetchMistakes}
                        className="p-2 text-gray-500 hover:text-gray-900 transition bg-white border border-gray-300 rounded-lg shadow-sm"
                        title="刷新"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>

                    <button
                        onClick={handlePrint}
                        className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-2 rounded-lg flex items-center shadow-sm transition text-sm"
                        title="打印"
                    >
                        <FileDown className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* AI Report Section */}
            {report && (
                <div className="bg-gradient-to-br from-indigo-50 to-white p-6 rounded-xl border border-indigo-100 shadow-sm animate-in fade-in slide-in-from-top-4 mb-6 relative">
                    <button
                        onClick={() => setReport(null)}
                        className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                    >
                        ✕
                    </button>
                    <div className="flex items-center mb-4 border-b border-indigo-100 pb-2">
                        <CheckCircle className="w-5 h-5 mr-2 text-indigo-600" />
                        <h3 className="text-lg font-bold text-indigo-900">AI 学习诊断报告</h3>
                    </div>
                    <div className="prose prose-indigo prose-sm max-w-none text-gray-700 leading-relaxed font-sans">
                        <pre className="whitespace-pre-wrap font-sans bg-transparent border-0 p-0 text-gray-800">{report}</pre>
                    </div>
                </div>
            )}

            {/* Filter Tabs */}
            {/* Filter & Sort Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-center print:hidden border-b border-gray-200 pb-4 gap-4">
                <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
                    {['all', 'recitation', 'quiz'].map((t) => (
                        <button
                            key={t}
                            onClick={() => setFilter(t as any)}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition capitalize ${filter === t ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            {t === 'all' ? `全部 (${mistakes.length})` : t === 'recitation' ? '单词拼写' : '练习题'}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-4">
                    {/* Sort Dropdown */}
                    <div className="relative flex items-center">
                        <span className="text-sm text-gray-500 mr-2">排序:</span>
                        <select
                            value={sort}
                            onChange={(e) => setSort(e.target.value as any)}
                            className="text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-1.5 pl-3 pr-8"
                        >
                            <option value="date_desc">📅 最近出错</option>
                            <option value="date_asc">⏳ 最早出错</option>
                            <option value="count_desc">🔥 写错次数 (高→低)</option>
                            <option value="az_asc">🔤 字母顺序 (A-Z)</option>
                        </select>
                    </div>

                    <div className="flex items-center">
                        <input
                            type="checkbox"
                            id="selectAll"
                            checked={filteredMistakes.length > 0 && selectedIds.size >= filteredMistakes.length}
                            onChange={handleSelectAll}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 mr-2"
                        />
                        <label htmlFor="selectAll" className="text-sm text-gray-600 cursor-pointer select-none">全选</label>
                    </div>
                </div>
            </div>

            {/* Print Header */}
            <div className="hidden print:block text-center mb-8">
                <h1 className="text-3xl font-bold text-gray-900">错题特训清单</h1>
                <p className="text-gray-500 mt-2">Generated by English Learning App</p>
            </div>

            {loading ? (
                <div className="text-center py-20 text-gray-500 animate-pulse">
                    正在加载数据...
                </div>
            ) : filteredMistakes.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-lg border border-dashed border-gray-300">
                    <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900">太棒了！</h3>
                    <p className="text-gray-500">暂时没有发现错题，继续保持！</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {filteredMistakes.map((item, idx) => (
                        <div
                            key={`${item.type}-${item.id}-${idx}`}
                            className={`bg-white p-5 rounded-lg shadow-sm border transition-all break-inside-avoid relative group
                                ${selectedIds.has(item.id) ? 'border-indigo-300 ring-1 ring-indigo-300 bg-indigo-50/30' : 'border-gray-200 hover:border-indigo-200'}
                            `}
                        >
                            <div className="absolute top-4 right-4 print:hidden">
                                <input
                                    type="checkbox"
                                    checked={selectedIds.has(item.id)}
                                    onChange={() => handleSelectOne(item.id)}
                                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-5 h-5 cursor-pointer"
                                />
                            </div>

                            <div className="flex justify-between items-start mb-2 pr-8">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-mono text-gray-400">#{idx + 1}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.type === 'recitation' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                                        }`}>
                                        {item.note}
                                    </span>
                                    {item.count > 1 && (
                                        <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                                            错 {item.count} 次
                                        </span>
                                    )}
                                </div>
                                <span className="text-xs text-gray-400">
                                    {new Date(item.lastAttempt || Date.now()).toLocaleDateString()}
                                </span>
                            </div>

                            <div className="mb-3 pr-8">
                                <h4 className="font-serif text-lg text-gray-900 leading-relaxed font-medium">
                                    {item.content}
                                </h4>
                            </div>

                            <div className="pt-3 border-t border-gray-100 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                                <div className="text-red-600 font-medium text-sm flex items-start">
                                    <span className="text-gray-400 text-xs mr-2 mt-0.5">Correct:</span>
                                    <span>{item.answer}</span>
                                </div>
                                {item.explanation && (
                                    <div className="text-sm text-gray-500 italic flex-1 sm:text-right bg-gray-50 p-2 rounded sm:bg-transparent sm:p-0">
                                        💡 {item.explanation}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
