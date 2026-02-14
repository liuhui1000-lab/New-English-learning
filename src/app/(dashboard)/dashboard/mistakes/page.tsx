"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { FileDown, AlertTriangle, CheckCircle, RefreshCw } from "lucide-react"

export default function ErrorNotebookPage() {
    const [mistakes, setMistakes] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<'all' | 'recitation' | 'quiz'>('all')

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
                        content: record.questions.content,
                        answer: record.questions.answer,
                        type: 'quiz',
                        note: record.questions.type === 'grammar' ? 'Grammar' : 'Collocation',
                        count: 1,
                        explanation: record.questions.explanation
                    })
                }
            })
        }

        setMistakes(allMistakes)
        setLoading(false)
    }

    const filteredMistakes = mistakes.filter(m => filter === 'all' || m.type === filter)

    const handlePrint = () => {
        window.print()
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex justify-between items-center print:hidden">
                <h2 className="text-2xl font-bold text-gray-900">我的错题本</h2>
                <div className="flex space-x-3">
                    <button
                        onClick={fetchMistakes}
                        className="p-2 text-gray-500 hover:text-gray-900 transition"
                    >
                        <RefreshCw className="w-5 h-5" />
                    </button>
                    <button
                        onClick={handlePrint}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center shadow-sm transition"
                    >
                        <FileDown className="w-4 h-4 mr-2" />
                        导出/打印
                    </button>
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit print:hidden">
                <button
                    onClick={() => setFilter('all')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition ${filter === 'all' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    全部 ({mistakes.length})
                </button>
                <button
                    onClick={() => setFilter('recitation')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition ${filter === 'recitation' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    单词拼写
                </button>
                <button
                    onClick={() => setFilter('quiz')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition ${filter === 'quiz' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    练习题
                </button>
            </div>

            {/* Print Header */}
            <div className="hidden print:block text-center mb-8">
                <h1 className="text-3xl font-bold text-gray-900">错题特训清单</h1>
                <p className="text-gray-500 mt-2">Generated by English Learning App</p>
            </div>

            {loading ? (
                <div className="text-center py-20 text-gray-500 animate-pulse">
                    正在分析错题数据...
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
                        <div key={item.id} className="bg-white p-5 rounded-lg shadow-sm border border-gray-200 break-inside-avoid">
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-xs font-mono text-gray-400">#{idx + 1}</span>
                                <span className={`text-xs px-2 py-1 rounded-full ${item.type === 'recitation' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                                    }`}>
                                    {item.note}
                                </span>
                            </div>

                            <div className="mb-3">
                                <h4 className="font-serif text-lg text-gray-900 leading-relaxed font-semibold">
                                    {item.content}
                                </h4>
                            </div>

                            <div className="pt-3 border-t border-gray-100 flex justify-between items-center">
                                <div className="text-red-600 font-medium">
                                    <span className="text-gray-400 text-xs mr-2">Correct:</span>
                                    {item.answer}
                                </div>
                                {item.explanation && (
                                    <div className="text-sm text-gray-500 italic max-w-md text-right">
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
