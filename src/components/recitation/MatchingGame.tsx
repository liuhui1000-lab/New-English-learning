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
    // Lock state for penalty phase
    const [isLocked, setIsLocked] = useState(false)
    const [teachingIds, setTeachingIds] = useState<string[]>([])

    useEffect(() => {
        if (!currentGroup) return

        // Initialize Game Board for CURRENT GROUP
        const l: MatchItem[] = []
        const r: MatchItem[] = []

        currentGroup.items.forEach(q => {
            // Parse Answer
            const posMatch = q.answer.match(/^([a-z]+\.)\s*(.*)/)
            const posText = posMatch ? posMatch[1] : ""
            const defText = posMatch ? posMatch[2] : q.answer

            l.push({ id: `w-${q.id}`, text: q.content, type: 'word', matchId: q.id })

            // Combine POS and Def into Right Column
            const rightText = posText ? `${posText} ${defText}` : defText
            r.push({ id: `d-${q.id}`, text: rightText, type: 'def', matchId: q.id })
        })

        setLeftCol(shuffle(l))
        setRightCol(shuffle(r))
        setMidCol([]) // Clear middle column
        setCompletedCardIds(new Set())
        setSolvedQuestionIds(new Set())
    }, [currentGroup])

    const shuffle = (array: any[]) => {
        return [...array].sort(() => Math.random() - 0.5)
    }

    // 2-COLUMN MATCH LOGIC
    const [selections, setSelections] = useState<{
        word?: MatchItem,
        def?: MatchItem
    }>({})

    const onCardClick = (item: MatchItem, col: 'word' | 'def') => {
        if (completedCardIds.has(item.id)) return

        // Toggle selection if clicking same item
        if (selections[col]?.id === item.id) {
            const newSel = { ...selections }
            delete newSel[col]
            setSelections(newSel)
            return
        }

        const newSel = { ...selections, [col]: item }
        setSelections(newSel)

        if (newSel.word && newSel.def) {
            checkPairMatch(newSel.word, newSel.def)
        }
    }

    const checkPairMatch = (w: MatchItem, d: MatchItem) => {
        // Strict Match (ID must be same)
        const isMatch = w.matchId === d.matchId

        if (isMatch) {
            // SUCCESS
            const newCompleted = new Set(completedCardIds)
            newCompleted.add(w.id)
            newCompleted.add(d.id)
            setCompletedCardIds(newCompleted)

            const newSolved = new Set(solvedQuestionIds)
            newSolved.add(w.matchId)
            setSolvedQuestionIds(newSolved)

            setSelections({})

            setFeedback('correct')
            setTimeout(() => setFeedback(null), 500)

            if (newSolved.size === currentGroup.items.length) {
                setTimeout(() => {
                    handleGroupComplete()
                }, 1000)
            }
        } else {
            // FAIL
            setFeedback('wrong')

            // 1. Trigger Penalty (Queue for Dictation)
            onError(w.matchId)

            // 2. TEACH MODE: Find the CORRECT partner for the WORD (Left Col)
            // We want to highlight the user's selected WORD and its TRUE definition
            const correctDefId = rightCol.find(item => item.matchId === w.matchId)?.id

            // Highlight them (Blue + Green pair) 
            // We'll use a special "teaching" state
            setTeachingIds([w.id, correctDefId || ''])

            // 3. Lock Board
            setIsLocked(true)

            // 4. Wait, then Shuffle
            setTimeout(() => {
                setFeedback(null)
                setTeachingIds([])
                setSelections({})

                // Shuffle both columns to force re-reading
                setLeftCol(prev => shuffle(prev))
                setRightCol(prev => shuffle(prev))

                setIsLocked(false)
            }, 2500) // 2.5s duration to study the correct pair
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
        <div className="p-4 max-w-4xl mx-auto select-none min-h-[60vh] flex flex-col justify-center">
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

            <div className="grid grid-cols-2 gap-12">
                {/* Left: Word */}
                <div className="space-y-4">
                    <h4 className="text-center font-bold text-gray-500 text-sm mb-2">单词</h4>
                    {leftCol.map(item => (
                        <Card
                            key={item.id}
                            item={item}
                            selected={selections.word?.id === item.id}
                            matched={completedCardIds.has(item.id)}
                            shake={shaking?.includes(item.id)}
                            isTeaching={teachingIds.includes(item.id)}
                            onClick={() => !isLocked && onCardClick(item, 'word')}
                            color="bg-blue-100 border-blue-300 text-blue-800 font-mono text-lg"
                        />
                    ))}
                </div>

                {/* Right: Definition (with POS) */}
                <div className="space-y-4">
                    <h4 className="text-center font-bold text-gray-500 text-sm mb-2">释义</h4>
                    {rightCol.map(item => (
                        <Card
                            key={item.id}
                            item={item}
                            selected={selections.def?.id === item.id}
                            matched={completedCardIds.has(item.id)}
                            shake={shaking?.includes(item.id)}
                            isTeaching={teachingIds.includes(item.id)}
                            onClick={() => !isLocked && onCardClick(item, 'def')}
                            color="bg-green-100 border-green-300 text-green-800 font-medium"
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

function Card({ item, selected, matched, shake, isTeaching, onClick, color }: any) {
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
                ${isTeaching ? 'ring-4 ring-orange-500 bg-orange-100 scale-105 z-20 !border-orange-400' : ''}
                ${!isTeaching && !selected ? color : ''}
            `}
        >
            <span className="text-center font-bold truncate w-full">
                {isTeaching && "👈 "}
                {item.text}
            </span>
        </motion.div>
    )
}
