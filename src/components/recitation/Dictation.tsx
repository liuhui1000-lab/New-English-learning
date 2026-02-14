"use client"

import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Check, X, HelpCircle, ArrowRight } from "lucide-react"
import { FlashcardGroup } from "./FlashcardView"

interface DictationProps {
    groups: FlashcardGroup[]
    onComplete: () => void
    onError: (failedId: string) => void
}

export default function Dictation({ groups, onComplete, onError }: DictationProps) {
    const [currentGroupIndex, setCurrentGroupIndex] = useState(0)
    const currentGroup = groups[currentGroupIndex]

    // Form State
    // Map questionId -> current input value
    const [inputs, setInputs] = useState<{ [key: string]: string }>({})

    // Status tracking for each field: 'idle' | 'correct' | 'wrong'
    const [fieldStatus, setFieldStatus] = useState<{ [key: string]: 'idle' | 'correct' | 'wrong' }>({})

    // Hint tracking
    const [activeHint, setActiveHint] = useState<string | null>(null)

    const firstInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        // Reset state on group change
        setInputs({})
        setFieldStatus({})
        setActiveHint(null)
        // Focus first input
        if (firstInputRef.current) setTimeout(() => firstInputRef.current?.focus(), 100)
    }, [currentGroup])

    const handleInputChange = (id: string, val: string) => {
        if (fieldStatus[id] === 'correct') return // Locked
        setInputs(prev => ({ ...prev, [id]: val }))
        // Reset wrong status on typing
        if (fieldStatus[id] === 'wrong') {
            setFieldStatus(prev => ({ ...prev, [id]: 'idle' }))
        }
    }

    const checkAll = (e: React.FormEvent) => {
        e.preventDefault()

        const newStatus = { ...fieldStatus }
        let allCorrect = true
        let hasErrors = false

        currentGroup.items.forEach(item => {
            // Skip already correct ones
            if (fieldStatus[item.id] === 'correct') return

            const guess = (inputs[item.id] || "").trim().toLowerCase()
            const target = item.content.trim().toLowerCase()

            if (guess === target) {
                newStatus[item.id] = 'correct'
            } else {
                newStatus[item.id] = 'wrong'
                allCorrect = false
                if (guess.length > 0) hasErrors = true // Only count as error if they tried

                // Trigger penalty if wrong (even empty? maybe strictly if they clicked check)
                onError(item.id)
            }
        })

        setFieldStatus(newStatus)

        if (allCorrect) {
            // Move to next group after delay
            setTimeout(() => {
                if (currentGroupIndex < groups.length - 1) {
                    setCurrentGroupIndex(prev => prev + 1)
                } else {
                    onComplete()
                }
            }, 800)
        }
    }

    // Track revealed answers
    const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set())

    const toggleHint = (id: string) => {
        if (activeHint === id) setActiveHint(null)
        else setActiveHint(id)
    }

    const showAnswer = (id: string) => {
        onError(id) // Mark as failed
        setFieldStatus(prev => ({ ...prev, [id]: 'idle' })) // Unlock input
        setInputs(prev => ({ ...prev, [id]: "" })) // Clear input for re-typing
        setRevealedIds(prev => new Set(prev).add(id)) // Show answer text
    }

    if (!currentGroup) return <div>Loading...</div>

    return (
        <div className="max-w-3xl mx-auto p-4 flex flex-col items-center min-h-[60vh]">
            <div className="text-center mb-8">
                <h3 className="text-xl font-bold text-indigo-800 font-comic mb-2">
                    ✍️ 默写挑战 ({currentGroupIndex + 1} / {groups.length})
                </h3>
                {currentGroup.items[0].tags?.find((t: string) => t.startsWith('Family:')) && (
                    <span className="text-sm text-indigo-400 font-mono bg-indigo-50 px-3 py-1 rounded-full">
                        Family: {currentGroup.items[0].tags.find((t: string) => t.startsWith('Family:'))?.split(':')[1]}
                    </span>
                )}
            </div>

            <form onSubmit={checkAll} className="w-full space-y-6 bg-white rounded-2xl shadow-xl p-8 border-4 border-indigo-50">
                {currentGroup.items.map((item, index) => {
                    const posMatch = item.answer.match(/^([a-z]+\.)\s*(.*)/)
                    const pos = posMatch ? posMatch[1] : ""
                    const def = posMatch ? posMatch[2] : item.answer
                    const status = fieldStatus[item.id] || 'idle'
                    const isRevealed = revealedIds.has(item.id)

                    return (
                        <motion.div
                            key={item.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                            className="flex items-center gap-4 border-b border-gray-100 last:border-0 pb-4 last:pb-0"
                        >
                            {/* Left: Prompt */}
                            <div className="w-1/2 text-right">
                                {pos && <span className="text-xs font-bold text-pink-500 bg-pink-50 px-2 py-0.5 rounded mr-2">{pos}</span>}
                                <span className="text-gray-700 font-medium">{def}</span>
                                {isRevealed && (
                                    <div className="mt-1 text-green-600 font-mono font-bold text-lg animate-pulse">
                                        👉 {item.content}
                                    </div>
                                )}
                            </div>

                            {/* Right: Input */}
                            <div className="relative w-1/2 max-w-xs">
                                <input
                                    ref={index === 0 ? firstInputRef : null}
                                    type="text"
                                    value={inputs[item.id] || ""}
                                    onChange={e => handleInputChange(item.id, e.target.value)}
                                    disabled={status === 'correct'}
                                    className={`
                                        w-full font-mono text-lg p-2 border-b-2 outline-none transition-colors
                                        ${status === 'idle' ? 'border-gray-300 focus:border-indigo-500' : ''}
                                        ${status === 'correct' ? 'border-green-500 text-green-600 bg-green-50' : ''}
                                        ${status === 'wrong' ? 'border-red-500 text-red-600 bg-red-50' : ''}
                                    `}
                                    placeholder={activeHint === item.id
                                        ? `${item.content[0]}${item.content.slice(1).replace(/./g, '_')}` // Only small hint in placeholder
                                        : ""}
                                    autoComplete="off"
                                />

                                {status === 'correct' && (
                                    <Check className="absolute right-2 top-3 w-5 h-5 text-green-500" />
                                )}
                                {status === 'wrong' && (
                                    <X className="absolute right-2 top-3 w-5 h-5 text-red-500" />
                                )}
                            </div>

                            {/* Help Button / Skip Button */}
                            <div className="flex gap-2">
                                {/* Regular Help Button (Cost?) */}
                                <button
                                    type="button"
                                    onClick={() => toggleHint(item.id)}
                                    className="text-gray-300 hover:text-indigo-400 transition"
                                    title="Show/Hide Hint"
                                >
                                    <HelpCircle className="w-5 h-5" />
                                </button>

                                {/* Give Up / Show Answer Button (Only if wrong) */}
                                {status === 'wrong' && (
                                    <button
                                        type="button"
                                        onClick={() => showAnswer(item.id)}
                                        className="text-red-300 hover:text-red-500 transition text-xs font-bold"
                                    >
                                        Show Answer
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    )
                })}

                <div className="pt-6 flex justify-center">
                    <button
                        type="submit"
                        className="px-10 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full font-bold shadow-lg transform hover:scale-105 transition flex items-center"
                    >
                        <Check className="w-5 h-5 mr-2" />
                        提交本组
                    </button>
                </div>
            </form>
        </div>
    )
}
