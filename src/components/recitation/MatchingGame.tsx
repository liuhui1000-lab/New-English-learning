"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import confetti from "canvas-confetti"
import { CheckCircle, XCircle, ArrowRight } from "lucide-react"
import { FlashcardGroup } from "./FlashcardView" // Reuse type

// Types for the game items
export interface MatchItem {
    id: string
    text: string
    type: 'word' | 'pos' | 'def'
    matchId: string // The ID connecting the group (Word Family Code or Question ID)
}

interface MatchingGameProps {
    groups: FlashcardGroup[]
    onComplete: () => void
    onError: (failedId: string) => void // Trigger "Group Penalty"
}

export default function MatchingGame({ groups, onComplete, onError }: MatchingGameProps) {
    const [currentGroupIndex, setCurrentGroupIndex] = useState(0)
    const currentGroup = groups[currentGroupIndex]

    const [leftCol, setLeftCol] = useState<MatchItem[]>([])
    const [midCol, setMidCol] = useState<MatchItem[]>([])
    const [rightCol, setRightCol] = useState<MatchItem[]>([])

    // Track VISIBILITY of individual cards (e.g. "w-1", "p-2")
    const [completedCardIds, setCompletedCardIds] = useState<Set<string>>(new Set())

    // Track solved QUESTIONS to know when group is done
    const [solvedQuestionIds, setSolvedQuestionIds] = useState<Set<string>>(new Set())

    // Feedback State
    const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
    const [shaking, setShaking] = useState<string | null>(null) // ID of item to shake

    useEffect(() => {
        if (!currentGroup) return

        // Initialize Game Board for CURRENT GROUP
        const l: MatchItem[] = []
        const m: MatchItem[] = []
        const r: MatchItem[] = []

        currentGroup.items.forEach(q => {
            // Parse Answer
            const posMatch = q.answer.match(/^([a-z]+\.)\s*(.*)/)
            const posText = posMatch ? posMatch[1] : "???"
            const defText = posMatch ? posMatch[2] : q.answer

            l.push({ id: `w-${q.id}`, text: q.content, type: 'word', matchId: q.id })
            m.push({ id: `p-${q.id}`, text: posText, type: 'pos', matchId: q.id })
            // Ambiguity Fix: Include POS in Definition Card text
            const clearDefText = `(${posText}) ${defText}`
            r.push({ id: `d-${q.id}`, text: clearDefText, type: 'def', matchId: q.id })
        })

        setLeftCol(shuffle(l))
        setMidCol(shuffle(m))
        setRightCol(shuffle(r))
        setCompletedCardIds(new Set())
        setSolvedQuestionIds(new Set())
    }, [currentGroup])

    const shuffle = (array: any[]) => {
        return [...array].sort(() => Math.random() - 0.5)
    }

    // Fuzzy Matching Helper
    const normalizeText = (text: string) => {
        return text.toLowerCase().replace(/[^a-z]/g, "")
    }

    // 3-COLUMN MATCH LOGIC
    const [selections, setSelections] = useState<{
        word?: MatchItem,
        pos?: MatchItem,
        def?: MatchItem
    }>({})

    const onCardClick = (item: MatchItem, col: 'word' | 'pos' | 'def') => {
        if (completedCardIds.has(item.id)) return

        const newSel = { ...selections, [col]: item }
        setSelections(newSel)

        if (newSel.word && newSel.pos && newSel.def) {
            checkTripleMatch(newSel.word, newSel.pos, newSel.def)
        }
    }

    const checkTripleMatch = (w: MatchItem, p: MatchItem, d: MatchItem) => {
        // 1. Word and Definition MUST strictly match (ID must be same)
        const isWordDefMatch = w.matchId === d.matchId

        // 2. Word and POS can be Loose Match (Content fuzzy match)
        // Find the "expected" POS text for this Word
        const targetQuestion = currentGroup.items.find(q => q.id === w.matchId)
        let isPosMatch = false

        if (targetQuestion) {
            const posMatch = targetQuestion.answer.match(/^([a-z]+\.)\s*(.*)/)
            const expectedPos = posMatch ? posMatch[1] : "???"

            // Check if selected POS card has effectively the same text
            if (normalizeText(p.text) === normalizeText(expectedPos)) {
                isPosMatch = true
            }
        }

        if (isWordDefMatch && isPosMatch) {
            // SUCCESS
            const newCompleted = new Set(completedCardIds)
            newCompleted.add(w.id)
            newCompleted.add(p.id)
            newCompleted.add(d.id)
            setCompletedCardIds(newCompleted)

            const newSolved = new Set(solvedQuestionIds)
            newSolved.add(w.matchId)
            setSolvedQuestionIds(newSolved)

            setSelections({})

            setFeedback('correct')
            setTimeout(() => setFeedback(null), 500)

            // Check if Level Complete (All Questions Solved)
            // Note: We check if verified questions count matches total items
            if (newSolved.size === currentGroup.items.length) {
                setTimeout(() => {
                    handleGroupComplete()
                }, 1000)
            }
        } else {
            // FAIL
            setShaking(`${w.id},${p.id},${d.id}`)
            setFeedback('wrong')

            // Trigger Penalty (blame the Word's ID)
            onError(w.matchId)

            setTimeout(() => {
                setShaking(null)
                setSelections({})
                setFeedback(null)
            }, 800)
        }
    }

    const handleGroupComplete = () => {
        if (currentGroupIndex < groups.length - 1) {
            setCurrentGroupIndex(prev => prev + 1)
        } else {
            // All Groups Done
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 }
            })
            setTimeout(onComplete, 2000)
        }
    }

    if (!currentGroup) return <div>Loading...</div>

    return (
        <div className="p-4 max-w-5xl mx-auto select-none min-h-[60vh] flex flex-col justify-center">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-indigo-800 font-comic">
                    🚀 连连看 ({currentGroupIndex + 1} / {groups.length})
                </h3>
                {currentGroup.items[0].tags?.find((t: string) => t.startsWith('Family:')) && (
                    <span className="text-sm text-indigo-400 font-mono bg-indigo-50 px-3 py-1 rounded-full">
                        Family: {currentGroup.items[0].tags.find((t: string) => t.startsWith('Family:'))?.split(':')[1]}
                    </span>
                )}
            </div>

            <div className="grid grid-cols-3 gap-6">
                {/* Left: POS */}
                <div className="space-y-3">
                    <h4 className="text-center font-bold text-gray-500 text-sm mb-2">词性</h4>
                    {midCol.map(item => (
                        <Card
                            key={item.id}
                            item={item}
                            selected={selections.pos?.id === item.id}
                            matched={completedCardIds.has(item.id)}
                            shake={shaking?.includes(item.id)}
                            onClick={() => onCardClick(item, 'pos')}
                            color="bg-pink-100 border-pink-300 text-pink-700"
                        />
                    ))}
                </div>

                {/* Center: Word */}
                <div className="space-y-3">
                    <h4 className="text-center font-bold text-gray-500 text-sm mb-2">单词</h4>
                    {leftCol.map(item => (
                        <Card
                            key={item.id}
                            item={item}
                            selected={selections.word?.id === item.id}
                            matched={completedCardIds.has(item.id)}
                            shake={shaking?.includes(item.id)}
                            onClick={() => onCardClick(item, 'word')}
                            color="bg-blue-100 border-blue-300 text-blue-800 font-mono text-lg"
                        />
                    ))}
                </div>

                {/* Right: Definition */}
                <div className="space-y-3">
                    <h4 className="text-center font-bold text-gray-500 text-sm mb-2">词义</h4>
                    {rightCol.map(item => (
                        <Card
                            key={item.id}
                            item={item}
                            selected={selections.def?.id === item.id}
                            matched={completedCardIds.has(item.id)}
                            shake={shaking?.includes(item.id)}
                            onClick={() => onCardClick(item, 'def')}
                            color="bg-green-100 border-green-300 text-green-800"
                        />
                    ))}
                </div>
            </div>

            {/* Feedback Overlay */}
            <AnimatePresence>
                {feedback === 'correct' && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1.2 }}
                        exit={{ opacity: 0 }}
                        className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-50"
                    >
                        <CheckCircle className="w-32 h-32 text-green-500 drop-shadow-2xl" />
                    </motion.div>
                )}
                {feedback === 'wrong' && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1.2 }}
                        exit={{ opacity: 0 }}
                        className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-50"
                    >
                        <XCircle className="w-32 h-32 text-red-500 drop-shadow-2xl" />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

function Card({ item, selected, matched, shake, onClick, color }: any) {
    if (matched) {
        return <div className="h-16 w-full opacity-0" /> // Placeholder to keep grid layout
    }

    return (
        <motion.div
            layout
            onClick={onClick}
            animate={shake ? { x: [-10, 10, -10, 10, 0] } : {}}
            transition={{ duration: 0.4 }}
            className={`
                h-16 flex items-center justify-center p-2 rounded-xl border-b-4 cursor-pointer shadow-sm
                transition-all transform hover:-translate-y-1 hover:shadow-md
                ${selected ? 'ring-4 ring-yellow-400 scale-105 z-10' : ''}
                ${color}
            `}
        >
            <span className="text-center font-bold truncate w-full">{item.text}</span>
        </motion.div>
    )
}
