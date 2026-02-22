"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { FileDown, AlertTriangle, CheckCircle, Trash, TrendingUp } from "lucide-react"

export default function ErrorNotebookPage() {
    const [mistakes, setMistakes] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<'all' | 'recitation' | 'quiz'>('all')
    const [selectedType, setSelectedType] = useState<string>('all')
    const [selectedTopic, setSelectedTopic] = useState<string>('all')
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
        console.log("Mistake Notebook v5.5-Stable | Source-Based separation")
        const allMistakes: any[] = []

        try {
            // 1. Fetch Recitation Mistakes (ONLY from Word Transformation Recitation flow)
            // Use !inner to strictly filter and ensure questions field is NEVER null
            const { data: recitationData, error: rError } = await supabase
                .from('user_progress')
                .select(`
                    *,
                    questions!inner (
                        id, content, answer, type, tags
                    )
                `)
                .in('questions.type', ['vocabulary', 'word_transformation'])
                .eq('status', 'learning')
                .gt('attempts', 0)

            if (rError) console.error("Recitation Fetch Error:", rError)

            if (recitationData) {
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
                .eq('is_correct', false)
                .order('attempt_at', { ascending: true })
                .limit(200)

            if (qError) console.error("Quiz Fetch Error:", qError)

            if (quizData) {
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

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                <span className="ml-3 text-gray-500">加载错题本中...</span>
            </div>
        )
    }

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">错题本</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        共记录 {mistakes.length} 道错题，坚持复习是进步的关键。
                    </p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => window.print()} className="flex items-center px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                        <FileDown className="w-4 h-4 mr-2" /> 导出 PDF / 打印
                    </button>
                    <button onClick={fetchMistakes} className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
                        <CheckCircle className="w-5 h-5 text-indigo-600" />
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
                {['all', 'recitation', 'quiz'].map((t) => (
                    <button
                        key={t}
                        onClick={() => setFilter(t as any)}
                        className={`px-6 py-2 rounded-md text-sm font-medium transition ${filter === t ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        {t === 'all' ? '全部' : t === 'recitation' ? '词转背诵回顾' : '练习/错题库'}
                    </button>
                ))}
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

            {/* List */}
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
                        <div key={item.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:border-indigo-200 transition">
                            <div className="p-5">
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
                                    <div className="mt-4 border-t border-gray-100 pt-4">
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
                    ))}
                </div>
            )}
        </div>
    )
}
