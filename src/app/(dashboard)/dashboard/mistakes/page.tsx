"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { FileDown, AlertTriangle, CheckCircle, Trash, TrendingUp, Loader2 } from "lucide-react"
import { exportToPDF } from "@/utils/pdfExport"

export default function ErrorNotebookPage() {
    const [mistakes, setMistakes] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<'all' | 'recitation' | 'quiz'>('all')
    const [selectedType, setSelectedType] = useState<string>('all')
    const [selectedTopic, setSelectedTopic] = useState<string>('all')
    const [sort, setSort] = useState<'date_desc' | 'date_asc' | 'count_desc' | 'az_asc'>('date_desc')
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [exporting, setExporting] = useState(false)

    // AI Analysis State
    const [analyzing, setAnalyzing] = useState(false)
    const [analysisData, setAnalysisData] = useState<{
        latestReport: any | null,
        history: any[],
        newMistakesCount: number,
        lastAnalyzedAt: string | null
    }>({ latestReport: null, history: [], newMistakesCount: 0, lastAnalyzedAt: null })
    const [showReportModal, setShowReportModal] = useState(false)
    const [viewingReport, setViewingReport] = useState<any | null>(null)

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder_key'
    )

    useEffect(() => {
        const initData = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                fetchMistakes()
                fetchAnalysis(user.id)
            }
        }
        initData()
    }, [])

    const fetchMistakes = async () => {
        setLoading(true)
        console.log("Mistake Notebook v5.6-Stable | Classification Fix | Build: 2026-02-23-11:45")
        const allMistakes: any[] = []

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            // 1. Fetch Recitation Mistakes (ONLY Vocabulary from recitation flow)
            // Separate word_transformation here to match user expectation: Recitation = Vocab
            const { data: recitationData, error: rError } = await supabase
                .from('user_progress')
                .select(`
                    *,
                    questions!inner (
                        id, content, answer, type, tags
                    )
                `)
                .eq('user_id', user.id)
                .eq('questions.type', 'vocabulary')
                .eq('status', 'learning')
                .gt('attempts', 0)

            if (rError) console.error("Recitation Fetch Error:", rError)

            if (recitationData) {
                console.log(`Fetched ${recitationData.length} recitation records from user_progress`)
                recitationData.forEach((record: any) => {
                    // !inner guarantees record.questions exists
                    const qType = record.questions.type
                    allMistakes.push({
                        id: record.questions.id,
                        content: record.questions.content,
                        answer: record.questions.answer,
                        type: 'recitation',
                        note: qType === 'word_transformation' ? '词汇变形' : '单词拼写',
                        count: record.attempts,
                        tags: record.questions.tags || [],
                        lastAttempt: record.updated_at || record.last_practiced_at
                    })
                })
            }

            // 2. Fetch Quiz Mistakes (ONLY from Practice/Mock paper source)
            const { data: quizData, error: qError } = await supabase
                .from('quiz_results')
                .select(`
                    id, answer, attempt_at, question_id,
                    questions!inner (
                        id, content, answer, type, explanation, tags
                    )
                `)
                .eq('user_id', user.id)
                .eq('is_correct', false)
                .order('attempt_at', { ascending: true })
                .limit(200)

            if (qError) console.error("Quiz Fetch Error:", qError)

            if (quizData) {
                console.log(`Fetched ${quizData.length} quiz records from quiz_results`)
                const grouped = new Map<string, any>()
                quizData.forEach((record: any) => {
                    const qId = record.questions.id // !inner guarantees this
                    if (!grouped.has(qId)) {
                        const qType = record.questions.type
                        grouped.set(qId, {
                            id: qId,
                            content: record.questions.content,
                            answer: record.questions.answer,
                            type: 'quiz',
                            note: qType === 'word_transformation' ? '词汇变形' :
                                qType === 'vocabulary' ? '单词拼写' :
                                    qType === 'grammar' ? '语法' :
                                        qType === 'sentence_transformation' ? '句型转换' : '词组搭配',
                            explanation: record.questions.explanation,
                            tags: record.questions.tags,
                            lastAttempt: record.attempt_at,
                            wrongAttempts: []
                        })
                    }
                    const item = grouped.get(qId)
                    item.wrongAttempts.push({
                        id: record.id,
                        answer: record.answer,
                        attempt_at: record.attempt_at
                    })
                    if (record.attempt_at > item.lastAttempt) item.lastAttempt = record.attempt_at
                })

                grouped.forEach(item => {
                    item.count = item.wrongAttempts.length
                    allMistakes.push(item)
                })
            }

            console.log(`Total mistakes in notebook: ${allMistakes.length}`)
            setMistakes(allMistakes)
        } catch (e) {
            console.error("Fatal fetch error:", e)
        } finally {
            setLoading(false)
        }
    }

    const filteredMistakes = mistakes
        .filter(m => {
            if (filter !== 'all' && m.type !== filter) return false
            if (selectedType !== 'all' && m.note !== selectedType) return false
            if (selectedTopic !== 'all') {
                const hasTopic = m.tags?.some((t: string) => t === `Topic:${selectedTopic}`)
                if (!hasTopic) return false
            }
            return true
        })
        .sort((a, b) => {
            switch (sort) {
                case 'date_desc': return new Date(b.lastAttempt || 0).getTime() - new Date(a.lastAttempt || 0).getTime()
                case 'date_asc': return new Date(a.lastAttempt || 0).getTime() - new Date(b.lastAttempt || 0).getTime()
                case 'count_desc': return b.count - a.count
                case 'az_asc': return a.content.localeCompare(b.content)
                default: return 0
            }
        })

    const fetchAnalysis = async (userId: string) => {
        try {
            console.log(`[Frontend] Triggering fetchAnalysis for ${userId}...`)
            const res = await fetch(`/api/ai/analyze-errors?userId=${userId}`)
            console.log(`[Frontend] fetchAnalysis response status: ${res.status}`)

            if (res.ok) {
                const data = await res.json()
                console.log(`[Frontend] fetchAnalysis JSON data:`, data)
                setAnalysisData({
                    latestReport: data.latestReport,
                    history: data.history || [],
                    newMistakesCount: data.newMistakesCount,
                    lastAnalyzedAt: data.latestReport?.created_at || null
                })
            } else {
                const errText = await res.text();
                console.error(`[Frontend] fetchAnalysis returned non-OK. Error payload:`, errText)
            }
        } catch (e) {
            console.error("[Frontend] fetchAnalysis failed absolutely (network/cors):", e)
        }
    }

    const handleAnalyzeErrors = async () => {
        if (!confirm("确定要对错题本进行 AI 深度分析吗？\n(系统将自动提取高频及最新练习题错题进行分析，不包含纯背诵任务)")) return
        setAnalyzing(true)
        setViewingReport(null) // Reset to show loading for the *new* report
        setShowReportModal(true) // Show modal immediately with loading state
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error("Unauthenticated")

            // Send actual lists based on smart sampling strategy from frontend
            const quizList = mistakes.filter(m => m.type !== 'recitation') // Frontend filter for safety
            const topFrequent = [...quizList].sort((a, b) => b.count - a.count).slice(0, 10)
            const recent = [...quizList].sort((a, b) => new Date(b.lastAttempt || 0).getTime() - new Date(a.lastAttempt || 0).getTime()).slice(0, 10)

            const res = await fetch('/api/ai/analyze-errors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.id,
                    stats: {
                        total: quizList.length,
                        type_distribution: quizList.reduce((acc: any, cur) => {
                            acc[cur.note] = (acc[cur.note] || 0) + 1;
                            return acc;
                        }, {})
                    },
                    frequent: topFrequent,
                    recent: recent
                })
            })

            if (!res.ok) {
                const errData = await res.json().catch(() => ({ error: 'Unknown Error' }))
                throw new Error(errData.error || '分析请求失败')
            }

            const data = await res.json()
            if (data.report) {
                setAnalysisData(prev => {
                    const newHistory = [data.report, ...prev.history].slice(0, 10)
                    return {
                        ...prev,
                        latestReport: data.report,
                        history: newHistory,
                        newMistakesCount: 0,
                        lastAnalyzedAt: data.report.created_at
                    }
                })
                setViewingReport(data.report)
            } else {
                fetchAnalysis(user.id) // Fallback
            }
        } catch (e: any) {
            alert("分析失败: " + e.message)
            setShowReportModal(false)
        } finally {
            setAnalyzing(false)
        }
    }

    const deleteReport = async (reportId: string) => {
        if (!confirm("确定要删除这份诊断报告吗？")) return
        try {
            const res = await fetch(`/api/ai/analyze-errors?id=${reportId}`, { method: 'DELETE' })
            if (!res.ok) throw new Error("Delete failed")

            setAnalysisData(prev => {
                const newHistory = prev.history.filter((r: any) => r.id !== reportId)
                return {
                    ...prev,
                    history: newHistory,
                    latestReport: newHistory.length > 0 ? newHistory[0] : null
                }
            })
        } catch (e: any) {
            alert("删除失败: " + e.message)
        }
    }

    const openReport = (report: any) => {
        setViewingReport(report)
        setShowReportModal(true)
    }

    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user) fetchAnalysis(user.id)
        })
    }, [])

    const availableTypes = Array.from(new Set(mistakes.map(m => m.note))).filter(Boolean).sort()
    const availableTopics = Array.from(new Set(
        mistakes.flatMap(m => m.tags || [])
            .filter((t: string) => t.startsWith('Topic:'))
            .map((t: string) => t.replace('Topic:', ''))
    )).sort()

    const handleDeleteAttempt = async (attemptId: string) => {
        if (!confirm('确认删除此错误记录？')) return
        const { error } = await supabase.from('quiz_results').delete().eq('id', attemptId)
        if (error) alert(error.message)
        else fetchMistakes()
    }

    const toggleSelection = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        )
    }

    const handleBulkAction = async (action: 'delete' | 'master') => {
        const count = selectedIds.length
        if (count === 0) return
        if (!confirm(`确认对选中的 ${count} 项进行${action === 'delete' ? '删除' : '标记已掌握'}操作？`)) return

        setLoading(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            if (action === 'delete') {
                // Delete from quiz_results (quiz source)
                await supabase.from('quiz_results').delete().in('question_id', selectedIds)
                // Also mark as 'new' or delete from progress to hide from recitation if needed
                // For simplicity, we just delete the quiz records here.
            } else {
                // Bulk Master: Mark in user_progress
                const masteredUpdates = selectedIds.map(id => ({
                    user_id: user.id,
                    question_id: id,
                    status: 'mastered',
                    updated_at: new Date().toISOString()
                }))
                await supabase.from('user_progress').upsert(masteredUpdates, {
                    onConflict: 'user_id,question_id'
                })
            }
            setSelectedIds([])
            await fetchMistakes()
        } catch (e) {
            console.error(e)
            alert("操作失败")
        } finally {
            setLoading(false)
        }
    }

    const handleExportPDF = async () => {
        setExporting(true)
        try {
            await exportToPDF('mistakes-list-container', `mistakes-notebook-${new Date().toISOString().split('T')[0]}.pdf`)
        } catch (error) {
            alert('导出失败，请重试')
        } finally {
            setExporting(false)
        }
    }

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                <span className="ml-3 text-gray-500">加载错题本中...</span>
            </div>
        )
    }

    return (
        <>
            <style dangerouslySetInnerHTML={{
                __html: `
                @media print {
                    @page { margin: 1.5cm; size: A4; }
                    .print\\:hidden, .fixed, .sidebar-container, nav, header { display: none !important; }
                    body, html { background: white !important; }
                    main, .p-6 { padding: 0 !important; margin: 0 !important; max-width: 100% !important; }
                    .mistake-card {
                        break-inside: avoid !important;
                        page-break-inside: avoid !important;
                        margin-bottom: 1.5rem !important;
                        border: 1px solid #e5e7eb !important;
                        box-shadow: none !important;
                    }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                }
            `}} />
            <div className="p-6 max-w-7xl mx-auto space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">错题本</h1>
                        <p className="text-sm text-gray-500 mt-1">
                            共记录 {mistakes.length} 道错题，坚持复习是进步的关键。
                        </p>
                    </div>
                    <div className="flex gap-2 items-center">
                        <div className="relative group">
                            <button
                                onClick={handleAnalyzeErrors}
                                disabled={analyzing || mistakes.filter(m => m.type !== 'recitation').length === 0}
                                className="flex items-center px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg text-sm font-medium hover:from-purple-700 hover:to-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm border border-transparent"
                            >
                                {analyzing ? (
                                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 分析中...</>
                                ) : (
                                    <><TrendingUp className="w-4 h-4 mr-2" /> AI 错题分析</>
                                )}
                            </button>
                            {/* Tooltip */}
                            <div className="absolute bottom-full left-1/2 min-w-[200px] -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition duration-200 shadow-xl z-50 pointer-events-none after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-4 after:border-transparent after:border-t-gray-900 whitespace-nowrap">
                                <div className="font-bold mb-1">🧠 AI 智能诊断逻辑</div>
                                <ul className="list-disc pl-4 space-y-1 text-gray-300">
                                    <li>仅深度分析<span className="text-white font-medium">练习题</span>(除单词外)</li>
                                    <li>自动提取<span className="text-white font-medium">Top 10 高频</span>顽固错题</li>
                                    <li>自动追加<span className="text-white font-medium">Top 10 最新</span>近期错题</li>
                                    <li>全面诊断知识薄弱点并生成方案</li>
                                </ul>
                            </div>
                        </div>

                        <button
                            onClick={handleExportPDF}
                            disabled={exporting}
                            className="flex items-center px-4 py-2 bg-white text-gray-700 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                        >
                            {exporting ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 生成中...</>
                            ) : (
                                <><FileDown className="w-4 h-4 mr-2" /> 导出 PDF</>
                            )}
                        </button>
                        <button onClick={() => window.print()} className="flex items-center px-4 py-2 bg-white text-gray-700 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition print:hidden shadow-sm" title="浏览器打印">
                            <FileDown className="w-4 h-4 mr-2" /> 打印
                        </button>
                        <button onClick={() => fetchAnalysis('dummy')} className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shadow-sm transition" title="刷新报告状态">
                            <CheckCircle className="w-5 h-5 text-indigo-600" />
                        </button>
                    </div>
                </div>

                {/* AI Report History List */}
                {analysisData.history.length > 0 && (
                    <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm print:hidden">
                        <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center">
                            <TrendingUp className="w-4 h-4 mr-2 text-indigo-600" /> 近期诊断报告 (显示最新 5 份)
                        </h2>
                        <div className="divide-y divide-gray-100">
                            {analysisData.history.slice(0, 5).map((report: any) => (
                                <div key={report.id} className="py-2.5 flex items-center justify-between group">
                                    <div className="flex items-center gap-4 flex-1">
                                        <span className="text-sm text-gray-500 w-36 shrink-0">
                                            {new Date(report.created_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                        <button
                                            onClick={() => openReport(report)}
                                            className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline font-medium truncate max-w-[200px] sm:max-w-sm flex-1 text-left"
                                        >
                                            {report.report_content.substring(0, 20).replace(/\n/g, '')}...
                                        </button>
                                        <div className="hidden sm:flex items-center text-xs text-gray-400">
                                            <span>触发者: {report.triggered_by_profile?.display_name || report.triggered_by_profile?.username || '用户本身'}</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => deleteReport(report.id)}
                                        className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-2 ml-4 shrink-0"
                                        title="删除报告"
                                    >
                                        <Trash className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Tabs */}
                <div className="flex items-center justify-between print:hidden">
                    <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
                        {['all', 'recitation', 'quiz'].map((t) => (
                            <button
                                key={t}
                                onClick={() => { setFilter(t as any); setSelectedIds([]); }}
                                className={`px-6 py-2 rounded-md text-sm font-medium transition ${filter === t ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                {t === 'all' ? '全部' : t === 'recitation' ? '背诵回顾' : '练习/错题库'}
                            </button>
                        ))}
                    </div>
                    {filteredMistakes.length > 0 && (
                        <div className="flex gap-3">
                            <button
                                onClick={() => setSelectedIds(filteredMistakes.map(m => m.id))}
                                className="text-sm text-indigo-600 hover:underline"
                            >
                                全选当前
                            </button>
                            <button
                                onClick={() => setSelectedIds([])}
                                className="text-sm text-gray-400 hover:underline"
                            >
                                取消选择
                            </button>
                        </div>
                    )}
                </div>

                {/* Filters */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:hidden">
                    <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} className="rounded-lg border-gray-200 text-sm">
                        <option value="all">所有题型</option>
                        {availableTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <select value={selectedTopic} onChange={(e) => setSelectedTopic(e.target.value)} className="rounded-lg border-gray-200 text-sm">
                        <option value="all">所有主题</option>
                        {availableTopics.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="rounded-lg border-gray-200 text-sm">
                        <option value="date_desc">最近日期</option>
                        <option value="date_asc">最早日期</option>
                        <option value="count_desc">错误次数</option>
                        <option value="az_asc">字母排序</option>
                    </select>
                </div>

                {/* Selection Toolbar (Floating) */}
                {selectedIds.length > 0 && (
                    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300 print:hidden">
                        <span className="text-sm font-bold border-r border-gray-700 pr-6">已选 {selectedIds.length} 项</span>
                        <div className="flex gap-4">
                            <button
                                onClick={() => handleBulkAction('master')}
                                className="text-sm text-green-400 hover:text-green-300 flex items-center font-bold"
                            >
                                <CheckCircle className="w-4 h-4 mr-1" /> 批量掌握
                            </button>
                            <button
                                onClick={() => handleBulkAction('delete')}
                                className="text-sm text-red-400 hover:text-red-300 flex items-center font-bold"
                            >
                                <Trash className="w-4 h-4 mr-1" /> 批量删除
                            </button>
                            <button
                                onClick={() => setSelectedIds([])}
                                className="text-sm text-gray-400 hover:text-gray-300 ml-2"
                            >
                                取消
                            </button>
                        </div>
                    </div>
                )}

                {/* List */}
                <div id="mistakes-list-container" className="export-pdf-safe">
                    {filteredMistakes.length === 0 ? (
                        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
                            <div className="mx-auto w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                                <CheckCircle className="w-8 h-8 text-gray-300" />
                            </div>
                            <h3 className="text-lg font-medium text-gray-900">暂无错题</h3>
                            <p className="text-gray-500 mt-1">太棒了！继续保持。</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {filteredMistakes.map((item) => (
                                <div key={item.id} className={`mistake-card bg-white rounded-xl border transition group break-inside-avoid ${selectedIds.includes(item.id) ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-gray-200 hover:border-indigo-200'
                                    }`}>
                                    <div className="p-5 flex gap-4">
                                        <div className="mt-1 print:hidden">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(item.id)}
                                                onChange={() => toggleSelection(item.id)}
                                                className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs font-bold rounded">
                                                            {item.note}
                                                        </span>
                                                        {item.count > 1 && (
                                                            <span className="px-2 py-0.5 bg-red-50 text-red-600 text-xs font-bold rounded flex items-center">
                                                                <AlertTriangle className="w-3 h-3 mr-1" /> 出错 {item.count} 次
                                                            </span>
                                                        )}
                                                    </div>
                                                    <h3 className="text-lg font-bold text-gray-900 leading-relaxed">
                                                        {item.content}
                                                    </h3>
                                                    <div className="mt-4 p-3 bg-green-50 rounded-lg">
                                                        <div className="text-xs text-green-600 font-bold mb-1 uppercase tracking-wider">正确答案</div>
                                                        <div className="text-gray-900 font-medium">✓ {item.answer}</div>
                                                    </div>
                                                    {item.explanation && (
                                                        <div className="mt-3 text-sm text-gray-500 italic flex items-start gap-2">
                                                            <span>💡</span> {item.explanation}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {item.wrongAttempts && item.wrongAttempts.length > 0 && (
                                                <div className="mt-4 border-t border-gray-100 pt-4 print:hidden">
                                                    <div className="text-xs text-gray-400 font-bold mb-2">错误记录 (按时间)</div>
                                                    <div className="space-y-2">
                                                        {item.wrongAttempts.map((att: any) => (
                                                            <div key={att.id} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded text-sm">
                                                                <div className="flex items-center gap-3">
                                                                    <span className="text-gray-400 text-xs">{new Date(att.attempt_at).toLocaleDateString()}</span>
                                                                    <span className="text-red-500 line-through">{att.answer || '(未作答)'}</span>
                                                                </div>
                                                                <button onClick={() => handleDeleteAttempt(att.id)} className="text-gray-400 hover:text-red-500">
                                                                    <Trash className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* AI Report Modal */}
            {showReportModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 print:hidden animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 flex items-center">
                                    <TrendingUp className="w-5 h-5 mr-2 text-indigo-600" /> AI 学习诊断报告
                                </h3>
                                {(viewingReport || analysisData.latestReport) && !analyzing && (
                                    <p className="text-xs text-gray-500 mt-1">
                                        生成于 {new Date((viewingReport || analysisData.latestReport).created_at).toLocaleString('zh-CN')}
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={() => setShowReportModal(false)}
                                className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-full transition"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 bg-white">
                            {analyzing ? (
                                <div className="flex flex-col items-center justify-center py-20">
                                    <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
                                    <p className="text-gray-900 font-medium text-lg">AI 正在深度分析错题...</p>
                                    <p className="text-gray-500 text-sm mt-2 text-center max-w-sm">
                                        正在提取高频错题与近期错题，生成知识点图谱，最多可能需要 60 秒，请耐心等待。
                                    </p>
                                </div>
                            ) : (viewingReport || analysisData.latestReport) ? (
                                <div className="prose prose-sm md:prose-base prose-indigo max-w-none">
                                    <pre className="whitespace-pre-wrap font-sans bg-transparent text-gray-800 p-0 m-0 leading-relaxed">
                                        {(viewingReport || analysisData.latestReport).report_content}
                                    </pre>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-20 text-center">
                                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                        <AlertTriangle className="w-8 h-8 text-gray-400" />
                                    </div>
                                    <p className="text-gray-900 font-medium">暂无有效的分析报告</p>
                                    <p className="text-gray-500 text-sm mt-1">生成失败或当前网络不稳定，请点击重试。</p>
                                    <button
                                        onClick={handleAnalyzeErrors}
                                        className="mt-6 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium"
                                    >
                                        重新生成分析报告
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end">
                            <button
                                onClick={() => setShowReportModal(false)}
                                className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition shadow-sm"
                            >
                                关闭报告
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
