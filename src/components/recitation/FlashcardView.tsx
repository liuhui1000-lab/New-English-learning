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
        <div className="max-w-xl mx-auto p-2 flex flex-col items-center h-full justify-center min-h-[60vh]">
            <h3 className="text-lg font-bold text-indigo-800 mb-4 font-comic">
                📚 认一认 ({index + 1} / {groups.length})
            </h3>

            <div className="relative w-full flex-1 max-h-[85vh] min-h-[400px] flex flex-col group">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentGroup.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3 }}
                        className="w-full h-full relative"
                    >
                        <div className="absolute inset-0 bg-white rounded-2xl shadow-xl border-4 border-indigo-100 flex flex-col p-4 md:p-6">
                            <div className="flex justify-between items-center mb-2 border-b border-indigo-50 pb-2">
                                <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">
                                    Phase 1: Memory
                                </span>
                                {currentGroup.items[0].tags?.find((t: string) => t.startsWith('Family:')) && (
                                    <span className="text-xs font-mono text-indigo-300 bg-indigo-50 px-2 py-1 rounded">
                                        Family: {currentGroup.items[0].tags.find((t: string) => t.startsWith('Family:'))?.split(':')[1]}
                                    </span>
                                )}
                            </div>

                            <div className="flex flex-col gap-2 w-full overflow-y-auto custom-scrollbar flex-1">
                                {currentGroup.items.map((item, idx) => {
                                    const posMatch = item.answer.match(/^([a-z]+\.)\s*(.*)/)
                                    const pos = posMatch ? posMatch[1] : ""
                                    const def = posMatch ? posMatch[2] : item.answer

                                    return (
                                        <div key={item.id} className="flex flex-col items-start p-2 md:p-3 bg-gray-50 rounded-lg hover:bg-indigo-50 transition-colors">
                                            <div className="text-xl md:text-2xl font-bold text-gray-800 mb-1 leading-none">
                                                {item.content}
                                            </div>

                                            <div className="flex items-center gap-2 text-gray-600 text-sm">
                                                {pos && (
                                                    <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded text-xs font-bold font-mono">
                                                        {pos}
                                                    </span>
                                                )}
                                                <span>{def}</span>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between w-full mt-4 px-4">
                <button
                    onClick={prev}
                    disabled={index === 0}
                    className="p-3 rounded-full hover:bg-gray-100 disabled:opacity-30 transition"
                >
                    <ChevronLeft className="w-5 h-5 text-gray-600" />
                </button>

                {index === groups.length - 1 ? (
                    <button
                        onClick={onComplete}
                        className="px-6 py-2 bg-green-500 hover:bg-green-600 text-white rounded-full font-bold shadow-md transform hover:scale-105 transition flex items-center text-sm"
                    >
                        <Play className="fill-current w-4 h-4 mr-2" />
                        Start Phase 2
                    </button>
                ) : (
                    <button
                        onClick={next}
                        className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full font-bold shadow-md transform hover:scale-105 transition text-sm"
                    >
                        Next
                    </button>
                )}

                <button
                    onClick={next}
                    disabled={index === groups.length - 1}
                    className="p-3 rounded-full hover:bg-gray-100 disabled:opacity-0 transition"
                >
                    <ChevronRight className="w-5 h-5 text-gray-600" />
                </button>
            </div>
        </div>
    )
}
