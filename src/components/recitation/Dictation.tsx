"use client"

import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Check, X, HelpCircle } from "lucide-react"

interface DictationProps {
    batch: any[] // The raw question objects
    onComplete: () => void
    onError: (failedId: string) => void
}

export default function Dictation({ batch, onComplete, onError }: DictationProps) {
    const [currentIndex, setCurrentIndex] = useState(0)
    const [input, setInput] = useState("")
    const [feedback, setFeedback] = useState<'idle' | 'correct' | 'wrong'>('idle')
    const [hintLevel, setHintLevel] = useState(0)

    const inputRef = useRef<HTMLInputElement>(null)
    const currentItem = batch[currentIndex]

    useEffect(() => {
        // Auto-focus input on change
        if (inputRef.current) inputRef.current.focus()
    }, [currentIndex])

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (feedback !== 'idle') return

        const target = currentItem.content.trim()
        const guess = input.trim()

        if (guess.toLowerCase() === target.toLowerCase()) {
            // Correct
            setFeedback('correct')
            setTimeout(() => {
                next()
            }, 800)
        } else {
            // Wrong
            setFeedback('wrong')
            onError(currentItem.id) // Trigger penalty
            setTimeout(() => {
                setFeedback('idle')
                setInput("") // Clear input to retry
            }, 1000)
        }
    }

    const next = () => {
        setFeedback('idle')
        setInput("")
        setHintLevel(0)

        if (currentIndex < batch.length - 1) {
            setCurrentIndex(prev => prev + 1)
        } else {
            onComplete()
        }
    }

    // Parse Answer (e.g. "adj. 快乐的") -> POS: "adj.", Def: "快乐的"
    const posMatch = currentItem.answer.match(/^([a-z]+\.)\s*(.*)/)
    const pos = posMatch ? posMatch[1] : "???"
    const def = posMatch ? posMatch[2] : currentItem.answer

    return (
        <div className="max-w-2xl mx-auto p-6 text-center">
            <h3 className="text-xl font-bold text-indigo-800 mb-8 font-comic">
                ✍️ 默写挑战 ({currentIndex + 1} / {batch.length})
            </h3>

            <div className="bg-white rounded-2xl shadow-lg p-10 mb-8 border-4 border-indigo-100">
                <div className="mb-6">
                    <span className="inline-block px-3 py-1 bg-pink-100 text-pink-600 rounded-full text-sm font-bold mb-2">
                        {pos}
                    </span>
                    <h2 className="text-3xl font-bold text-gray-800">
                        {def}
                    </h2>
                </div>

                {/* Hint Area */}
                <div className="h-8 mb-4 text-gray-400 font-mono tracking-widest">
                    {hintLevel > 0 && (
                        <span>
                            {currentItem.content.split('').map((char: string, i: number) => (
                                i === 0 || i === currentItem.content.length - 1 || Math.random() > 0.5
                                    ? char : '_'
                            )).join(' ')}
                        </span>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="relative max-w-sm mx-auto">
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        className={`
                            w-full text-center text-2xl font-mono p-3 border-b-4 outline-none transition-colors
                            ${feedback === 'idle' ? 'border-gray-300 focus:border-indigo-500' : ''}
                            ${feedback === 'correct' ? 'border-green-500 text-green-600 bg-green-50' : ''}
                            ${feedback === 'wrong' ? 'border-red-500 text-red-600 bg-red-50' : ''}
                        `}
                        placeholder="Type here..."
                        autoComplete="off"
                        autoCapitalize="off"
                    />

                    <AnimatePresence>
                        {feedback === 'wrong' && (
                            <motion.div
                                initial={{ x: -10, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute right-[-40px] top-4"
                            >
                                <X className="text-red-500 w-8 h-8" />
                            </motion.div>
                        )}
                        {feedback === 'correct' && (
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute right-[-40px] top-4"
                            >
                                <Check className="text-green-500 w-8 h-8" />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </form>

                {feedback === 'wrong' && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="mt-4 text-sm text-red-400"
                    >
                        加油！再试一次！
                    </motion.div>
                )}
            </div>

            <div className="flex justify-center">
                <button
                    onClick={() => setHintLevel(prev => prev + 1)}
                    className="flex items-center text-gray-400 hover:text-indigo-500 transition-colors text-sm"
                >
                    <HelpCircle className="w-4 h-4 mr-1" />
                    需要提示?
                </button>
            </div>
        </div>
    )
}
