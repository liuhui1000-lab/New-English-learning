"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Question } from "@/types"

function PracticeContent() {
    const searchParams = useSearchParams()
    const type = searchParams?.get('type') || 'word_transformation'

    const [questions, setQuestions] = useState<Question[]>([])
    const [answers, setAnswers] = useState<Record<string, string>>({})
    const [results, setResults] = useState<Record<string, boolean | null>>({})
    const [submitted, setSubmitted] = useState(false)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchPracticeBatch()
    }, [type])

    const fetchPracticeBatch = async () => {
        setLoading(true)
        const limit = type === 'word_transformation' ? 5 : 10

        const { data } = await supabase
            .from('questions')
            .select('*')
            .eq('type', type)
            // .eq('status', 'learning') // Real logic needs progress join
            .limit(limit)

        if (data) setQuestions(data as Question[])
        setLoading(false)
    }

    const handleSubmit = () => {
        const newResults: Record<string, boolean> = {}
        questions.forEach(q => {
            const userAnswer = (answers[q.id] || "").trim().toLowerCase()
            const correctAnswer = (q.answer || "").trim().toLowerCase()
            newResults[q.id] = userAnswer === correctAnswer
        })
        setResults(newResults)
        setSubmitted(true)
    }

    if (loading) return <div>Loading...</div>

    return (
        <div className="max-w-2xl mx-auto space-y-8 pb-12">
            <h2 className="text-2xl font-bold mb-6">
                {type === 'word_transformation' ? '词汇转换特训 (5题)' : '固定搭配/语法 (10题)'}
            </h2>

            {questions.map((q, idx) => (
                <div key={q.id} className="bg-white p-6 rounded-lg shadow space-y-4">
                    <div className="flex items-start">
                        <span className="font-bold text-gray-400 mr-2">{idx + 1}.</span>
                        <p className="text-lg text-gray-800 leading-relaxed font-serif">
                            {/* Simple template replacement logic if needed */}
                            {q.content}
                        </p>
                    </div>

                    <div className="pl-6">
                        <input
                            type="text"
                            disabled={submitted}
                            value={answers[q.id] || ""}
                            onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                            className={`w-full border-b-2 border-0 border-gray-300 focus:ring-0 focus:border-indigo-600 bg-gray-50 px-2 py-1 rounded transition
                            ${submitted && results[q.id] ? 'bg-green-50 border-green-500 text-green-700' : ''}
                            ${submitted && !results[q.id] ? 'bg-red-50 border-red-500 text-red-700' : ''}
                        `}
                            placeholder="在此输入答案..."
                        />

                        {submitted && !results[q.id] && (
                            <div className="mt-2 text-sm text-red-600 animate-pulse">
                                正确答案: <strong>{q.answer}</strong>
                            </div>
                        )}
                    </div>
                </div>
            ))}

            {!submitted ? (
                <button
                    onClick={handleSubmit}
                    className="w-full py-4 bg-indigo-600 text-white font-bold rounded-lg shadow-lg hover:bg-indigo-700 transition"
                >
                    提交答案
                </button>
            ) : (
                <button
                    onClick={() => window.location.reload()}
                    className="w-full py-4 bg-gray-600 text-white font-bold rounded-lg shadow-lg hover:bg-gray-700 transition"
                >
                    再来一组
                </button>
            )}
        </div>
    )
}

export default function PracticePage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <PracticeContent />
        </Suspense>
    )
}
