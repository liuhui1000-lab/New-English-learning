"use client"

import { useState, useEffect, Suspense, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Question } from "@/types"
import HandwritingRecognizer from "@/components/handwriting/HandwritingRecognizer"
import { Loader2, AlertCircle } from "lucide-react"

function PracticeContent() {
    const searchParams = useSearchParams()
    const type = searchParams?.get('type') || 'word_transformation'

    const [questions, setQuestions] = useState<Question[]>([])
    const [answers, setAnswers] = useState<Record<string, string>>({})
    const [results, setResults] = useState<Record<string, boolean | null>>({})
    const [submitted, setSubmitted] = useState(false)
    const [loading, setLoading] = useState(true)
    const [showHandwriting, setShowHandwriting] = useState(false)
    const [enableAutoOCR, setEnableAutoOCR] = useState(true)

    useEffect(() => {
        fetchPracticeBatch()
    }, [type])

    const fetchPracticeBatch = async () => {
        setLoading(true)
        const limit = (type === 'word_transformation' || type === 'sentence_transformation') ? 5 : 10

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            // 1. Fetch ALL Question IDs for this type
            const { data: allQuestions } = await supabase
                .from('questions')
                .select('id')
                .eq('type', type)

            if (!allQuestions || allQuestions.length === 0) {
                setQuestions([])
                setLoading(false)
                return
            }

            // 2. Fetch User History for this type
            const { data: userHistory } = await supabase
                .from('quiz_results')
                .select('question_id, is_correct, attempt_at')
                .eq('user_id', user.id)
                .eq('question_type', type)
                .order('attempt_at', { ascending: false }) // Latest first

            // 3. Process & Categorize
            const processedIds = new Set<string>()
            const activeWrongIds: string[] = []
            const masteredDetails: { id: string, errorCount: number }[] = []

            // Map to track error counts per question
            const errorCounts: Record<string, number> = {}

            if (userHistory) {
                userHistory.forEach((record: any) => {
                    if (!errorCounts[record.question_id]) errorCounts[record.question_id] = 0
                    if (!record.is_correct) errorCounts[record.question_id]++

                    if (!processedIds.has(record.question_id)) {
                        processedIds.add(record.question_id)
                        if (record.is_correct) {
                            // Last attempt correct -> Mastered
                            masteredDetails.push({ id: record.question_id, errorCount: 0 }) // count updated later
                        } else {
                            // Last attempt wrong -> Active Wrong
                            activeWrongIds.push(record.question_id)
                        }
                    }
                })

                // Update error counts for mastered items
                masteredDetails.forEach(m => m.errorCount = errorCounts[m.id] || 0)
            }

            // New Questions = All - Processed
            const newIds = allQuestions
                .filter((q: any) => !processedIds.has(q.id))
                .map((q: any) => q.id)

            // 4. Selection Logic
            let selectedIds: string[] = []
            const maxWrong = Math.ceil(limit * 0.3) // Max 30% wrong

            // 4.1. Pick max 30% from Active Wrong (Random)
            // Shuffle Active Wrong first
            activeWrongIds.sort(() => Math.random() - 0.5)
            const chosenWrong = activeWrongIds.slice(0, maxWrong)
            selectedIds.push(...chosenWrong)

            // 4.2. Fill remainder with New (Random)
            let remainingSlots = limit - selectedIds.length
            newIds.sort(() => Math.random() - 0.5)
            const chosenNew = newIds.slice(0, remainingSlots)
            selectedIds.push(...chosenNew)

            // 4.3. If New ran out, fill with more Active Wrong
            remainingSlots = limit - selectedIds.length
            if (remainingSlots > 0 && activeWrongIds.length > chosenWrong.length) {
                const moreWrong = activeWrongIds.slice(maxWrong, maxWrong + remainingSlots)
                selectedIds.push(...moreWrong)
            }

            // 4.4. Fallback: If still not enough, use Mastered (Sorted by Error Count DESC)
            remainingSlots = limit - selectedIds.length
            if (remainingSlots > 0 && masteredDetails.length > 0) {
                // Sort by error count desc
                masteredDetails.sort((a, b) => b.errorCount - a.errorCount)
                const chosenMastered = masteredDetails.slice(0, remainingSlots).map(m => m.id)
                selectedIds.push(...chosenMastered)
                // Optional: Notify user they are reviewing mastered content?
                if (selectedIds.length === chosenMastered.length) {
                    // All are mastered
                    // console.log("Review Mode: All questions are mastered")
                }
            }

            // 5. Fetch Details for Selected IDs
            // Handle edge case where total DB count < limit
            if (selectedIds.length === 0) {
                // Fallback to simple random if something went wrong or DB is empty
                const { data: randomData } = await supabase
                    .from('questions')
                    .select('*')
                    .eq('type', type)
                    .limit(limit)
                if (randomData) setQuestions(randomData as Question[])
            } else {
                const { data: finalQuestions } = await supabase
                    .from('questions')
                    .select('*')
                    .in('id', selectedIds)

                if (finalQuestions) {
                    // Shuffle the final batch so "Wrong" questions aren't always at top
                    const shuffled = (finalQuestions as Question[]).sort(() => Math.random() - 0.5)
                    setQuestions(shuffled)
                }
            }

            // Clear previous answers/results UI
            setAnswers({})
            setResults({})
            setSubmitted(false)

        } catch (error) {
            console.error("Failed to fetch practice batch:", error)
        }
        setLoading(false)
    }

    const recognizerRefs = useRef<Record<string, { recognize: () => Promise<string | null> }>>({})
    const [isSubmitting, setIsSubmitting] = useState(false)

    const handleSubmit = async () => {
        setIsSubmitting(true)

        // 1. Process Handwriting Batch (if any)
        if (showHandwriting) {
            console.log("Batch processing handwriting answers...")
            try {
                const recognitionPromises = questions.map(async (q) => {
                    const recognizer = recognizerRefs.current[q.id]
                    if (recognizer) {
                        // Skip if answer already manually filled? 
                        // Strategy: If user manually typed something, keep it? 
                        // Or handwriting overwrite? 
                        // User request: "Auto recognize then fill" implies overwrite or fill if empty.
                        // Let's assume handwriting is authoritative if present.
                        const text = await recognizer.recognize()
                        // Allow empty string (clearing answer) if user wrote nothing
                        if (text !== null) {
                            return { id: q.id, text }
                        }
                    }
                    return null
                })

                const results = await Promise.all(recognitionPromises)
                console.log("Batch Recognition Results:", results)

                // Update answers state synchronously before grading
                // Note: setAnswers is async, so we must use a local variable for grading
                const newAnswers = { ...answers }
                results.forEach(r => {
                    if (r) {
                        console.log(`Setting answer for ${r.id}: ${r.text}`)
                        newAnswers[r.id] = r.text
                        // Also update UI state
                        setAnswers(prev => ({ ...prev, [r.id]: r.text }))
                    } else {
                        console.warn("No recognition result for question (null returned)")
                    }
                })

                // Pass newAnswers to grading logic
                await finalizeSubmission(newAnswers)

            } catch (e) {
                console.error("Batch recognition error:", e)
                alert("手写识别过程中发生错误，将直接提交现有答案。")
                await finalizeSubmission(answers)
            }
        } else {
            await finalizeSubmission(answers)
        }

        setIsSubmitting(false)
    }

    const finalizeSubmission = async (currentAnswers: Record<string, string>) => {
        const newResults: Record<string, boolean | null> = {}
        const submissionData: any[] = []

        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            alert("请先登录")
            return
        }

        questions.forEach(q => {
            const userAnswer = (currentAnswers[q.id] || "").trim().toLowerCase()
            const correctAnswer = (q.answer || "").trim().toLowerCase()

            if (!correctAnswer) {
                newResults[q.id] = null // Mark as not graded
            } else {
                // Normalize answers for comparison:
                // 1. Replace separators (;,，) with spaces
                // 2. Collapse multiple spaces to single space
                // 3. Trim and lowercase
                const normalize = (str: string) => str.replace(/[;；,，]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()

                const isCorrect = userAnswer !== "" && normalize(userAnswer) === normalize(correctAnswer)
                newResults[q.id] = isCorrect

                submissionData.push({
                    user_id: user.id,
                    question_id: q.id,
                    is_correct: isCorrect,
                    answer: userAnswer,
                    question_type: type,
                    source_type: 'quiz'
                })
            }
        })

        setResults(newResults)
        setSubmitted(true)

        // Async save to DB
        const { error } = await supabase
            .from('quiz_results')
            .insert(submissionData)

        if (error) {
            console.error("Failed to save results:", error)
            alert("提交失败，成绩未能保存！错误信息：" + error.message)
        }
    }

    // Keep handleRecognized for manual clicks
    const handleRecognized = (questionId: string, text: string) => {
        setAnswers(prev => ({ ...prev, [questionId]: text }))
    }

    if (loading) return <div>Loading...</div>

    return (
        <div className="max-w-2xl mx-auto space-y-8 pb-12">
            {isSubmitting && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center flex-col text-white">
                    <Loader2 className="w-10 h-10 animate-spin mb-4" />
                    <p className="text-lg font-bold">正在识别手写答案并判分...</p>
                </div>
            )}

            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">
                    {type === 'word_transformation' ? '词汇转换特训 (5题)' :
                        type === 'sentence_transformation' ? '句型转换特训 (5题)' :
                            '固定搭配/语法 (10题)'}
                </h2>

                {(type === 'word_transformation' || type === 'sentence_transformation') && (
                    <label className="flex items-center cursor-pointer">
                        <div className="mr-3 text-sm font-medium text-gray-700">启用手写板</div>
                        <div className="relative">
                            <input
                                type="checkbox"
                                className="sr-only"
                                checked={showHandwriting}
                                onChange={() => setShowHandwriting(!showHandwriting)}
                            />
                            <div className={`block w-10 h-6 rounded-full transition-colors ${showHandwriting ? 'bg-indigo-600' : 'bg-gray-300'}`}></div>
                            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${showHandwriting ? 'transform translate-x-4' : ''}`}></div>
                        </div>
                    </label>
                )}

                {showHandwriting && (
                    <label className="flex items-center cursor-pointer ml-4">
                        <div className="mr-2 text-xs font-medium text-gray-500">自动识别(Beta)</div>
                        <input
                            type="checkbox"
                            className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                            checked={enableAutoOCR}
                            onChange={(e) => setEnableAutoOCR(e.target.checked)}
                        />
                    </label>
                )}
            </div>

            {questions.map((q, idx) => (
                <div key={q.id} className="bg-white p-6 rounded-lg shadow space-y-4">
                    <div className="flex items-start">
                        <span className="font-bold text-gray-400 mr-2">{idx + 1}.</span>
                        <p className="text-lg text-gray-800 leading-relaxed font-serif">
                            {/* Parse and format content: html tags & line breaks */}
                            {(() => {
                                // Only apply line splitting for Sentence Transformation questions
                                const shouldSplit = type === 'sentence_transformation'
                                let lines: string[] = [q.content]

                                if (shouldSplit) {
                                    // Split by brackets containing Chinese/Instruction
                                    // Match (xyz) or （xyz） followed by space
                                    const formattedText = q.content.replace(/(\([^)]+\)|（[^）]+）)\s*/g, "$1\n")
                                    lines = formattedText.split('\n')
                                }

                                return lines.map((line, i) => (
                                    <span key={i} className={`block ${shouldSplit ? 'mb-2 last:mb-0' : ''}`}>
                                        {/* HTML Tag Parsing (<u> and ^{}) */}
                                        {line.split(/((?:<u>.*?<\/u>)|(?:\^\{[^}]+\}))/g).map((part, j) => {
                                            if (part.startsWith('<u>') && part.endsWith('</u>')) {
                                                return <u key={j} className="decoration-2 underline-offset-4 decoration-indigo-500 font-semibold">{part.slice(3, -4)}</u>
                                            }
                                            if (part.startsWith('^{') && part.endsWith('}')) {
                                                return <sup key={j}>{part.slice(2, -1)}</sup>
                                            }
                                            return <span key={j}>{part}</span>
                                        })}
                                    </span>
                                ))
                            })()}
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

                        {submitted && results[q.id] === false && (
                            <div className="mt-2 text-sm text-red-600 font-medium">
                                正确答案：{q.answer}
                            </div>
                        )}

                        {submitted && results[q.id] === null && (
                            <div className="mt-3 p-3 bg-yellow-50 text-yellow-800 text-sm rounded-lg border border-yellow-100 flex items-center">
                                <AlertCircle className="w-4 h-4 mr-2" />
                                系统尚无标准答案，无法自动批改。
                            </div>
                        )}

                        {submitted && results[q.id] !== null && q.explanation && (
                            <div className="mt-3 p-3 bg-blue-50 text-blue-800 text-sm rounded-lg border border-blue-100">
                                <span className="font-bold block mb-1">解析：</span>
                                {q.explanation}
                            </div>
                        )}

                        {!submitted && showHandwriting && (
                            <div className="mt-4 pt-4 border-t border-gray-100">
                                <HandwritingRecognizer
                                    // @ts-ignore
                                    ref={el => { if (el) recognizerRefs.current[q.id] = el }}
                                    height={150}
                                    placeholder="在 iPad 上用笔在此处草拟答案..."
                                    onRecognized={(text) => handleRecognized(q.id, text)}
                                    enableAutoRecognize={enableAutoOCR}
                                />
                            </div>
                        )}
                    </div>
                </div>
            ))}

            {!submitted ? (
                <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="w-full py-4 bg-indigo-600 text-white font-bold rounded-lg shadow-lg hover:bg-indigo-700 transition disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    {isSubmitting ? '识别判分中...' : '提交答案 (自动识别)'}
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
