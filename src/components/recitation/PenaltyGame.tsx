"use client"

import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Check, X, AlertCircle } from "lucide-react"
import { Question } from "@/types"

interface PenaltyGameProps {
    failedItems: Question[]
    onComplete: () => void
}

interface ReviewItem {
    question: Question
    streak: number // Current consecutive correct answers in this session. Needs 2 to clear.
}

export default function PenaltyGame({ failedItems, onComplete }: PenaltyGameProps) {
    // Queue of items to review
    const [queue, setQueue] = useState<ReviewItem[]>(() =>
        failedItems.map(q => ({ question: q, streak: 0 }))
    )

    // Current item being reviewed
    const [currentItemIndex, setCurrentItemIndex] = useState(0)
    const currentItem = queue[currentItemIndex]

    const [input, setInput] = useState("")
    const [status, setStatus] = useState<'idle' | 'correct' | 'wrong'>('idle')
    const [showAnswer, setShowAnswer] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (inputRef.current) setTimeout(() => inputRef.current?.focus(), 100)
    }, [currentItemIndex, queue])

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (status !== 'idle') return // Already processed

        const target = currentItem.question.content.trim().toLowerCase()
        const guess = input.trim().toLowerCase()

        if (guess === target) {
            handleCorrect()
        } else {
            handleWrong()
        }
    }

    const handleCorrect = () => {
        setStatus('correct')

        setTimeout(() => {
            const nextQueue = [...queue]
            const item = { ...nextQueue[currentItemIndex] }

            item.streak += 1

            if (item.streak >= 2) {
                // Remove from queue
                nextQueue.splice(currentItemIndex, 1)
                // Index stays same (next item slides in), unless we were at end
                if (currentItemIndex >= nextQueue.length) {
                    setCurrentItemIndex(0)
                }
            } else {
                // Move to end of queue for next attempt
                nextQueue.splice(currentItemIndex, 1)
                nextQueue.push(item) // Re-add to end
                setCurrentItemIndex(0) // Start from top? Or keep going? 
                // Better: Just set index to 0 (next item) since we moved current to end
            }

            if (nextQueue.length === 0) {
                onComplete()
            } else {
                setQueue(nextQueue)
                resetForm()
            }
        }, 800)
    }

    const handleWrong = () => {
        setStatus('wrong')
        setShowAnswer(true)
        // Reset streak on error
        const nextQueue = [...queue]
        nextQueue[currentItemIndex].streak = 0
        setQueue(nextQueue)
    }

    const resetForm = () => {
        setInput("")
        setStatus('idle')
        setShowAnswer(false)
    }

    // When answer is shown, user must type correctly to proceed (but streak is already 0)
    const handleRetryAfterWrong = (e: React.FormEvent) => {
        e.preventDefault()
        const target = currentItem.question.content.trim().toLowerCase()
        const guess = input.trim().toLowerCase()

        if (guess === target) {
            // Correctly copied the answer
            // Just move to next item (moved to end of queue)
            const nextQueue = [...queue]
            const item = nextQueue.splice(currentItemIndex, 1)[0]
            nextQueue.push(item)
            setQueue(nextQueue)
            setCurrentItemIndex(0) // Reset to start
            resetForm()
        } else {
            // Still wrong? Shake or something.
            // Just let them keep typing.
        }
    }

    if (!currentItem) return <div>Clean!</div>

    const posMatch = currentItem.question.answer.match(/^([a-z]+\.)\s*(.*)/)
    const pos = posMatch ? posMatch[1] : ""
    const def = posMatch ? posMatch[2] : currentItem.question.answer

    return (
        <div className="max-w-md mx-auto p-8 flex flex-col items-center justify-center min-h-[60vh]">
            <div className="text-center mb-6">
                <div className="flex items-center justify-center gap-2 mb-2">
                    <AlertCircle className="text-orange-500 w-6 h-6" />
                    <h3 className="text-xl font-bold text-gray-800">错题特训</h3>
                </div>
                <p className="text-sm text-gray-500">
                    剩余 {queue.length} 个单词，需连续正确 2 次移除
                </p>
                <div className="mt-2 w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
                    <div
                        className={`h-full ${currentItem.streak === 1 ? 'bg-green-500' : 'bg-gray-300'}`}
                        style={{ width: '100%' }} // Actually streak/2 but visual simplified
                    />
                </div>
                <p className="text-xs text-gray-400 mt-1">
                    当前连对: {currentItem.streak}/2
                </p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-xl w-full border-2 border-orange-100">
                <div className="text-center mb-6">
                    {pos && <span className="inline-block bg-pink-100 text-pink-600 px-2 py-0.5 rounded text-xs font-bold mb-2">{pos}</span>}
                    <h2 className="text-2xl font-bold text-gray-800">{def}</h2>
                </div>

                {showAnswer ? (
                    <div className="mb-4 text-center">
                        <p className="text-red-500 text-sm font-bold mb-1">正确答案</p>
                        <p className="text-2xl font-mono text-indigo-600 font-bold tracking-widest">{currentItem.question.content}</p>
                        <p className="text-xs text-gray-400 mt-2">请在下方照着输入一遍以加深记忆</p>
                    </div>
                ) : null}

                <form onSubmit={showAnswer ? handleRetryAfterWrong : handleSubmit} className="relative">
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        className={`
                            w-full text-center text-xl font-mono p-3 border-b-2 outline-none transition-colors
                            ${status === 'idle' ? 'border-gray-300 focus:border-indigo-500' : ''}
                            ${status === 'correct' ? 'border-green-500 text-green-600' : ''}
                            ${status === 'wrong' ? 'border-red-500 text-red-600' : ''}
                        `}
                        placeholder="Type here..."
                        autoComplete="off"
                        autoCapitalize="off"
                    />

                    {status === 'correct' && (
                        <motion.div
                            initial={{ scale: 0 }} animate={{ scale: 1 }}
                            className="absolute right-0 top-3 text-green-500"
                        >
                            <Check />
                        </motion.div>
                    )}
                </form>

                <div className="mt-6">
                    <button
                        onClick={showAnswer ? handleRetryAfterWrong : handleSubmit}
                        className={`
                            w-full py-3 rounded-lg font-bold text-white shadow-md transition-transform transform active:scale-95
                            ${showAnswer ? 'bg-indigo-500 hover:bg-indigo-600' : 'bg-orange-500 hover:bg-orange-600'}
                        `}
                    >
                        {showAnswer ? "记住了，继续" : "检查"}
                    </button>
                    {/* Add Give Up for Review? No, force them to learn. */}
                </div>
            </div>
        </div>
    )
}
