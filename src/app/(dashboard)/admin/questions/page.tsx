"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { Question, QuestionType } from "@/types"
import { Search, Filter, Cpu, CheckCircle, AlertCircle, Trash, Edit2, ChevronLeft, ChevronRight, Save } from "lucide-react"
import MultiSelect from "@/components/MultiSelect"

export default function QuestionBankPage() {
    const [questions, setQuestions] = useState<Question[]>([])
    const [loading, setLoading] = useState(true)
    const [totalCount, setTotalCount] = useState(0)

    // Tabs and Filters
    const [activeTab, setActiveTab] = useState<'questions' | 'vocabulary'>('questions')
    const [selectedTypes, setSelectedTypes] = useState<string[]>([])
    const [filterAIStatus, setFilterAIStatus] = useState<string>('all')
    const [searchQuery, setSearchQuery] = useState('')

    // Pagination
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)

    // Selection
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

    // Actions
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [statusMessage, setStatusMessage] = useState<string | null>(null)

    useEffect(() => {
        setPage(1)
        setSelectedIds(new Set()) // Fix: Clear selection on tab change
        setSelectedTypes([]) // Reset filters on tab change
    }, [activeTab])

    useEffect(() => {
        fetchQuestions()
    }, [page, pageSize, activeTab, selectedTypes, filterAIStatus, searchQuery])

    const fetchQuestions = async () => {
        setLoading(true)
        let query = supabase
            .from('questions')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range((page - 1) * pageSize, page * pageSize - 1)

        // 1. Tab Filter
        if (activeTab === 'questions') {
            query = query.neq('type', 'vocabulary')
        } else {
            query = query.eq('type', 'vocabulary')
        }

        // 2. Type Filter (Multi-select)
        if (selectedTypes.length > 0) {
            query = query.in('type', selectedTypes)
        }

        if (filterAIStatus === 'analyzed') {
            query = query.eq('is_ai_analyzed', true)
        } else if (filterAIStatus === 'not_analyzed') {
            query = query.or('is_ai_analyzed.is.false,is_ai_analyzed.is.null')
        }

        if (searchQuery) {
            query = query.ilike('content', `%${searchQuery}%`)
        }

        const { data, count, error } = await query

        // ... (handle data)
        if (error) {
            console.error(error)
            alert("Error fetching questions")
        } else {
            setQuestions(data as Question[])
            setTotalCount(count || 0)
        }
        setLoading(false)
    }

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setQuestions(prev => {
                const newSet = new Set(selectedIds)
                prev.forEach(q => newSet.add(q.id))
                setSelectedIds(newSet)
                return prev
            })
        } else {
            const newSet = new Set(selectedIds)
            questions.forEach(q => newSet.delete(q.id))
            setSelectedIds(newSet)
        }
    }

    const handleSelectOne = (id: string) => {
        const newSet = new Set(selectedIds)
        if (newSet.has(id)) newSet.delete(id)
        else newSet.add(id)
        setSelectedIds(newSet)
    }

    const handleDelete = async () => {
        if (selectedIds.size === 0) return
        if (!confirm(`确定要删除选中的 ${selectedIds.size} 道题目吗？此操作不可恢复。`)) return

        const { error } = await supabase
            .from('questions')
            .delete()
            .in('id', Array.from(selectedIds))

        if (error) {
            alert("删除失败: " + error.message)
        } else {
            alert("删除成功")
            setSelectedIds(new Set())
            fetchQuestions()
        }
    }

    const handleBatchAIAnalyze = async () => {
        const idsToProcess = Array.from(selectedIds)
        if (idsToProcess.length === 0) return
        if (!confirm(`即将对选中的 ${idsToProcess.length} 道题目进行 AI 分析。`)) return

        setIsAnalyzing(true)
        setStatusMessage("正在准备分析...")

        try {
            const { data: targets } = await supabase
                .from('questions')
                .select('id, content, type, tags, answer')
                .in('id', idsToProcess)

            if (!targets) throw new Error("无法获取题目内容")

            const BATCH_SIZE = 5
            for (let i = 0; i < targets.length; i += BATCH_SIZE) {
                const batch = targets.slice(i, i + BATCH_SIZE)
                setStatusMessage(`AI 分析中... (${Math.min(i + BATCH_SIZE, targets.length)}/${targets.length})`)

                const items = batch.map(q => q.content)
                const res = await fetch('/api/ai/analyze', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items, mode: 'tagging' })
                })

                if (!res.ok) {
                    console.error("Batch failed", res.statusText)
                    continue
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

                const { error: updateError } = await supabase
                    .from('questions')
                    .upsert(updates)

                if (updateError) {
                    console.error("Update failed", updateError)
                }

                await new Promise(resolve => setTimeout(resolve, 500))
            }

            setStatusMessage("分析完成")
            fetchQuestions()
            setSelectedIds(new Set())

        } catch (err: any) {
            alert("分析过程出错: " + err.message)
        } finally {
            setIsAnalyzing(false)
            setTimeout(() => setStatusMessage(null), 3000)
        }
    }

    // Define Options based on Tab
    const typeOptions = activeTab === 'questions' ? [
        { label: "语法选择", value: "grammar" },
        { label: "词汇转换", value: "word_transformation" },
        { label: "句型转换", value: "sentence_transformation" },
        { label: "固定搭配", value: "collocation" }
    ] : [] // No sub-types for vocabulary yet

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">内容题库</h2>
                    <p className="text-sm text-gray-500">共 {totalCount} 条记录</p>
                </div>

                {/* ... (Actions) ... */}
                <div className="flex items-center space-x-2 w-full md:w-auto">
                    {selectedIds.size > 0 && (
                        <div className="flex items-center bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 animate-in fade-in">
                            <span className="text-sm text-indigo-700 mr-3 font-medium">已选 {selectedIds.size} 项</span>
                            <button
                                onClick={handleBatchAIAnalyze}
                                disabled={isAnalyzing}
                                className="text-xs bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700 mr-2 flex items-center"
                            >
                                <Cpu className="w-3 h-3 mr-1" />
                                {isAnalyzing ? '处理中...' : 'AI 分析'}
                            </button>
                            <button
                                onClick={handleDelete}
                                className="text-xs bg-white text-red-600 border border-red-200 px-3 py-1 rounded hover:bg-red-50 flex items-center"
                            >
                                <Trash className="w-3 h-3 mr-1" /> 删除
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-8">
                    <button
                        onClick={() => setActiveTab('questions')}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                            ${activeTab === 'questions'
                                ? 'border-indigo-500 text-indigo-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
                        `}
                    >
                        练习题库 (Questions)
                    </button>
                    <button
                        onClick={() => setActiveTab('vocabulary')}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                            ${activeTab === 'vocabulary'
                                ? 'border-indigo-500 text-indigo-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
                        `}
                    >
                        单词背诵 (Vocabulary)
                    </button>
                </nav>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-wrap gap-4 items-center">
                <div className="flex items-center space-x-2">
                    <Filter className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">筛选:</span>
                </div>

                {activeTab === 'questions' && (
                    <MultiSelect
                        options={typeOptions}
                        selected={selectedTypes}
                        onChange={setSelectedTypes}
                        placeholder="所有题型"
                        className="w-48"
                    />
                )}

                <select
                    value={filterAIStatus}
                    onChange={e => setFilterAIStatus(e.target.value)}
                    className="text-sm border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                >
                    <option value="all">AI 状态 (全部)</option>
                    <option value="not_analyzed">未分析</option>
                    <option value="analyzed">已分析</option>
                </select>

                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="搜索内容..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                    />
                </div>
            </div>

            {/* Status Message */}
            {statusMessage && (
                <div className="bg-blue-50 text-blue-700 px-4 py-3 rounded-lg flex items-center">
                    <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full mr-2"></div>
                    {statusMessage}
                </div>
            )}

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 w-10 text-center">
                                <input
                                    type="checkbox"
                                    onChange={handleSelectAll}
                                    checked={questions.length > 0 && selectedIds.size >= questions.length} // Simple check
                                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[40%]">题目</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">类型 / 标签</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">AI 状态</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-10 text-center text-gray-500">
                                    加载中...
                                </td>
                            </tr>
                        ) : questions.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-10 text-center text-gray-500">
                                    没有找到符合条件的题目
                                </td>
                            </tr>
                        ) : (
                            questions.map(q => (
                                <tr key={q.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-4 text-center">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(q.id)}
                                            onChange={() => handleSelectOne(q.id)}
                                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="text-sm text-gray-900 font-mono line-clamp-2" title={q.content}>{q.content}</p>
                                        <div className="mt-1 text-xs text-gray-500">Ans: {q.answer || '(无)'}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-0.5 rounded text-xs inline-block mb-1
                                             ${q.type === 'grammar' ? 'bg-blue-50 text-blue-700' :
                                                q.type === 'word_transformation' ? 'bg-purple-50 text-purple-700' :
                                                    'bg-gray-100 text-gray-700'}`}>
                                            {q.type}
                                        </span>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {q.tags?.slice(0, 3).map((tag, i) => (
                                                <span key={i} className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[10px] rounded border">
                                                    {tag}
                                                </span>
                                            ))}
                                            {q.tags?.length > 3 && <span className="text-[10px] text-gray-400">+{q.tags.length - 3}</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {q.is_ai_analyzed ? (
                                            <span className="flex items-center text-green-600 text-xs font-medium">
                                                <CheckCircle className="w-3 h-3 mr-1" /> 已分析
                                            </span>
                                        ) : (
                                            <span className="flex items-center text-gray-400 text-xs">
                                                <AlertCircle className="w-3 h-3 mr-1" /> 未处理
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right text-sm">
                                        {/* Placeholder for Edit */}
                                        <button className="text-indigo-600 hover:text-indigo-900 mr-3">编辑</button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-200">
                <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-600">每页显示:</span>
                    <select
                        value={pageSize}
                        onChange={e => {
                            setPageSize(Number(e.target.value))
                            setPage(1)
                        }}
                        className="text-sm border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500 py-1"
                    >
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                    </select>
                </div>

                <div className="flex items-center space-x-4">
                    <span className="text-sm text-gray-600">
                        第 {page} 页 / 共 {Math.ceil(totalCount / pageSize)} 页
                    </span>
                    <div className="flex space-x-1">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="p-2 rounded hover:bg-white disabled:opacity-50 border border-gray-200"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setPage(p => p + 1)}
                            disabled={page * pageSize >= totalCount}
                            className="p-2 rounded hover:bg-white disabled:opacity-50 border border-gray-200"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
