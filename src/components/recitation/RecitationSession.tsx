"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import FlashcardView from "./FlashcardView"
import MatchingGame from "./MatchingGame"
import Dictation from "./Dictation"
import { Question } from "@/types"

interface RecitationSessionProps {
    batch: Question[]
    onComplete: (results: SessionResult[]) => void
}

export interface SessionResult {
    questionId: string
    isPassed: boolean
    hasFamilyPenalty: boolean
}

export default function RecitationSession({ batch, onComplete }: RecitationSessionProps) {
    const [phase, setPhase] = useState<'flashcard' | 'matching' | 'dictation' | 'summary'>('flashcard')
    const [failedItems, setFailedItems] = useState<Set<string>>(new Set())

    // Helper to get Family/Group ID from tags
    // Tag format: "Family:rootword"
    const getGroupId = (q: Question) => {
        const familyTag = q.tags?.find(t => t.startsWith('Family:'))
        return familyTag || q.id // Fallback to own ID if no family
    }

    const handlePhaseError = (questionId: string) => {
        // 1. Find the question
        const q = batch.find(i => i.id === questionId)
        if (!q) return

        // 2. Identify the Group
        const groupId = getGroupId(q)

        // 3. Mark ALL items in this group as failed
        const groupMembers = batch.filter(i => getGroupId(i) === groupId)

        const newFailed = new Set(failedItems)
        groupMembers.forEach(m => newFailed.add(m.id))
        setFailedItems(newFailed)
    }

    const finishSession = () => {
        // Calculate results
        const results: SessionResult[] = batch.map(q => ({
            questionId: q.id,
            isPassed: !failedItems.has(q.id),
            hasFamilyPenalty: failedItems.has(q.id)
        }))
        onComplete(results)
    }

    return (
        <div className="min-h-screen bg-indigo-50 flex flex-col">
            {/* Thread / Progress Bar */}
            <div className="w-full h-2 bg-gray-200">
                <motion.div
                    className="h-full bg-indigo-500"
                    initial={{ width: "0%" }}
                    animate={{
                        width: phase === 'flashcard' ? "33%" :
                            phase === 'matching' ? "66%" : "100%"
                    }}
                />
            </div>

            <div className="flex-1 container mx-auto p-4 flex flex-col">
                <AnimatePresence mode="wait">
                    {phase === 'flashcard' && (
                        <motion.div
                            key="flashcard"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="flex-1"
                        >
                            <FlashcardView
                                batch={batch}
                                onComplete={() => setPhase('matching')}
                            />
                        </motion.div>
                    )}

                    {phase === 'matching' && (
                        <motion.div
                            key="matching"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="flex-1"
                        >
                            <MatchingGame
                                batch={batch}
                                onError={handlePhaseError}
                                onComplete={() => setPhase('dictation')}
                            />
                        </motion.div>
                    )}

                    {phase === 'dictation' && (
                        <motion.div
                            key="dictation"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="flex-1"
                        >
                            <Dictation
                                batch={batch}
                                onError={handlePhaseError}
                                onComplete={finishSession}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}
