"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronRight, ChevronLeft, Play } from "lucide-react"

interface FlashcardViewProps {
    batch: any[]
    onComplete: () => void
}

export default function FlashcardView({ batch, onComplete }: FlashcardViewProps) {
    const [index, setIndex] = useState(0)
    const [isFlipped, setIsFlipped] = useState(false)

    // Auto-advance? Maybe let user control.

    const next = () => {
        setIsFlipped(false)
        if (index < batch.length - 1) {
            setIndex(index + 1)
        } else {
            // End of stack
        }
    }

    const prev = () => {
        setIsFlipped(false)
        if (index > 0) setIndex(index - 1)
    }

    const current = batch[index]

    // Parse POS/Def
    const posMatch = current.answer.match(/^([a-z]+\.)\s*(.*)/)
    const pos = posMatch ? posMatch[1] : "word"
    const def = posMatch ? posMatch[2] : current.answer

    return (
        <div className="max-w-xl mx-auto p-4 flex flex-col items-center h-full justify-center min-h-[60vh]">
            <h3 className="text-xl font-bold text-indigo-800 mb-6 font-comic">
                📚 认一认 ({index + 1} / {batch.length})
            </h3>

            <div className="relative w-full aspect-[4/3] perspective-1000 group cursor-pointer" onClick={() => setIsFlipped(!isFlipped)}>
                <motion.div
                    className="w-full h-full relative transition-all duration-500 transform-style-3d"
                    animate={{ rotateY: isFlipped ? 180 : 0 }}
                    transition={{ duration: 0.6 }}
                >
                    {/* Front: Word */}
                    <div className="absolute inset-0 bg-white rounded-2xl shadow-xl border-4 border-indigo-100 flex flex-col items-center justify-center p-8 backface-hidden">
                        <span className="text-sm font-bold text-indigo-400 uppercase tracking-widest mb-4">
                            Phase 1: Memory
                        </span>
                        <h2 className="text-5xl font-extrabold text-gray-800 mb-4 text-center">
                            {current.content}
                        </h2>
                        <p className="text-gray-400 text-sm mt-8">(点击翻转看释义)</p>
                    </div>

                    {/* Back: Def & POS */}
                    <div className="absolute inset-0 bg-indigo-600 rounded-2xl shadow-xl flex flex-col items-center justify-center p-8 backface-hidden rotate-y-180 text-white">
                        <span className="px-3 py-1 bg-white/20 rounded-full text-sm font-bold mb-6">
                            {pos}
                        </span>
                        <h3 className="text-3xl font-bold text-center leading-relaxed">
                            {def}
                        </h3>
                        {/* Family Tag Hint */}
                        {current.tags?.find((t: string) => t.startsWith('Family:')) && (
                            <div className="mt-8 pt-4 border-t border-white/20 text-indigo-200 text-sm">
                                🔒 属于词族: {current.tags.find((t: string) => t.startsWith('Family:')).split(':')[1]}
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between w-full mt-10 px-4">
                <button
                    onClick={prev}
                    disabled={index === 0}
                    className="p-3 rounded-full hover:bg-gray-100 disabled:opacity-30 transition"
                >
                    <ChevronLeft className="w-6 h-6 text-gray-600" />
                </button>

                {index === batch.length - 1 ? (
                    <button
                        onClick={onComplete}
                        className="px-8 py-3 bg-green-500 hover:bg-green-600 text-white rounded-full font-bold shadow-lg transform hover:scale-105 transition flex items-center"
                    >
                        <Play className="fill-current w-5 h-5 mr-2" />
                        开始挑战
                    </button>
                ) : (
                    <button
                        onClick={next}
                        className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full font-bold shadow-lg transform hover:scale-105 transition"
                    >
                        下一个
                    </button>
                )}

                <button
                    onClick={next}
                    disabled={index === batch.length - 1}
                    className="p-3 rounded-full hover:bg-gray-100 disabled:opacity-0 transition"
                >
                    <ChevronRight className="w-6 h-6 text-gray-600" />
                </button>
            </div>
        </div>
    )
}
