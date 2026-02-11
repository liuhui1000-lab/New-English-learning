"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { Question } from "@/types"
import { Check, X, RefreshCw } from "lucide-react"

export default function StudyPage() {
    const [questions, setQuestions] = useState<Question[]>([])
    const [currentIndex, setCurrentIndex] = useState(0)
    const [isFlipped, setIsFlipped] = useState(false)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchStudyBatch()
    }, [])

    const fetchStudyBatch = async () => {
        // Basic Fetch: Get 20 questions that are NOT 'mastered'
        // Real-world: Join with user_progress and filter.
        // MVP: Just fetch all questions for demo.
        setLoading(true)
        const { data } = await supabase
            .from('questions')
            .select('*')
            .limit(20)

        if (data) setQuestions(data as Question[])
        setLoading(false)
    }

    const handleNext = () => {
        setIsFlipped(false)
        if (currentIndex < questions.length - 1) {
            setCurrentIndex(prev => prev + 1)
        } else {
            alert("本组背诵完成！")
            // Logic to start review or go back
        }
    }

    const markMastered = async () => {
        // API call to update status
        handleNext()
    }

    if (loading) return <div>加载中...</div>
    if (questions.length === 0) return <div>暂无学习内容</div>

    const currentQ = questions[currentIndex]

    return (
        <div className="max-w-md mx-auto h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">背诵 ({currentIndex + 1}/{questions.length})</h2>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                    {currentQ.type === 'word_transformation' ? '词汇转换' : '固定搭配'}
                </span>
            </div>

            {/* Flashcard Area */}
            <div
                className="flex-1 relative perspective-1000 group cursor-pointer"
                onClick={() => setIsFlipped(!isFlipped)}
            >
                <div className={`relative w-full h-full transition-all duration-500 transform-style-3d ${isFlipped ? 'rotate-y-180' : ''}`}>
                    {/* Front */}
                    <div className="absolute w-full h-full backface-hidden bg-white shadow-xl rounded-2xl flex flex-col items-center justify-center p-8 border-2 border-indigo-50">
                        <div className="text-3xl font-bold text-center text-gray-800">
                            {/* Display Logic based on Type */}
                            {currentQ.type === 'word_transformation' ? (
                                <>
                                    <span className="block text-gray-500 text-lg mb-2">Root Word</span>
                                    {currentQ.hint || currentQ.content}
                                </>
                            ) : (
                                currentQ.content // For Collocation, show context
                            )}
                        </div>
                        <p className="mt-8 text-gray-400 text-sm animate-pulse">点击翻转</p>
                    </div>

                    {/* Back */}
                    <div className="absolute w-full h-full backface-hidden rotate-y-180 bg-indigo-600 shadow-xl rounded-2xl flex flex-col items-center justify-center p-8 text-white">
                        <div className="text-3xl font-bold text-center">
                            {currentQ.answer || "Answer"}
                        </div>
                        <p className="mt-4 text-indigo-200 text-center text-sm">
                            {currentQ.explanation || "No explanation"}
                        </p>
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="mt-8 flex justify-between space-x-4">
                <button
                    onClick={handleNext}
                    className="flex-1 py-3 rounded-lg bg-orange-100 text-orange-700 font-bold hover:bg-orange-200 transition"
                >
                    <X className="w-5 h-5 inline mr-1" />
                    需加强
                </button>
                <button
                    onClick={markMastered}
                    className="flex-1 py-3 rounded-lg bg-green-100 text-green-700 font-bold hover:bg-green-200 transition"
                >
                    <Check className="w-5 h-5 inline mr-1" />
                    已掌握
                </button>
            </div>
        </div>
    )
}
