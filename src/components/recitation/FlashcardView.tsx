"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronRight, ChevronLeft, Play } from "lucide-react"
import { Question } from "@/types"

export interface FlashcardGroup {
    id: string
    items: Question[]
}

interface FlashcardViewProps {
    groups: FlashcardGroup[]
    onComplete: () => void
}

export default function FlashcardView({ groups, onComplete }: FlashcardViewProps) {
    const [index, setIndex] = useState(0)

    const next = () => {
        if (index < groups.length - 1) {
            setIndex(index + 1)
        }
    }

    const prev = () => {
        if (index > 0) setIndex(index - 1)
    }

    const currentGroup = groups[index]

    if (!currentGroup) return <div>Loading...</div>

    return (
        <div className="max-w-xl mx-auto p-4 flex flex-col items-center h-full justify-center min-h-[60vh]">
            <h3 className="text-xl font-bold text-indigo-800 mb-6 font-comic">
                📚 认一认 ({index + 1} / {groups.length})
            </h3>

            <div className="relative w-full aspect-[4/3] group cursor-pointer">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentGroup.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3 }}
                        className="w-full h-full relative"
                    >
                        <div className="absolute inset-0 bg-white rounded-2xl shadow-xl border-4 border-indigo-100 flex flex-col items-center justify-center p-8 overflow-y-auto custom-scrollbar">
                            <span className="text-sm font-bold text-indigo-400 uppercase tracking-widest mb-4">
                                Phase 1: Memory
                            </span>

                            <div className="flex flex-col gap-6 w-full">
                                {currentGroup.items.map((item, idx) => {
                                    const posMatch = item.answer.match(/^([a-z]+\.)\s*(.*)/)
                                    const pos = posMatch ? posMatch[1] : ""
                                    const def = posMatch ? posMatch[2] : item.answer

                                    return (
                                        <div key={item.id} className="flex flex-col items-center border-b border-indigo-50 last:border-0 pb-4 last:pb-0">
                                            <div className="text-3xl font-extrabold text-gray-800 mb-2">
                                                {item.content}
                                            </div>

                                            <div className="flex items-center gap-2 text-gray-600">
                                                {pos && (
                                                    <span className="px-2 py-0.5 bg-indigo-100 text-indigo-600 rounded text-xs font-bold font-mono">
                                                        {pos}
                                                    </span>
                                                )}
                                                <span className="text-lg">{def}</span>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Family Tag Hint */}
                            {currentGroup.items[0].tags?.find((t: string) => t.startsWith('Family:')) && (
                                <div className="mt-6 pt-4 border-t border-indigo-50 text-indigo-300 text-sm">
                                    🔒 Word Family: {currentGroup.items[0].tags.find((t: string) => t.startsWith('Family:'))?.split(':')[1]}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </AnimatePresence>
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

                {index === groups.length - 1 ? (
                    <button
                        onClick={onComplete}
                        className="px-8 py-3 bg-green-500 hover:bg-green-600 text-white rounded-full font-bold shadow-lg transform hover:scale-105 transition flex items-center"
                    >
                        <Play className="fill-current w-5 h-5 mr-2" />
                        Start Phase 2
                    </button>
                ) : (
                    <button
                        onClick={next}
                        className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full font-bold shadow-lg transform hover:scale-105 transition"
                    >
                        Next
                    </button>
                )}

                <button
                    onClick={next}
                    disabled={index === groups.length - 1}
                    className="p-3 rounded-full hover:bg-gray-100 disabled:opacity-0 transition"
                >
                    <ChevronRight className="w-6 h-6 text-gray-600" />
                </button>
            </div>
        </div>
    )
}
