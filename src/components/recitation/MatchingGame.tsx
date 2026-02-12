"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import confetti from "canvas-confetti"
import { CheckCircle, XCircle } from "lucide-react"

// Types for the game items
export interface MatchItem {
    id: string
    text: string
    type: 'word' | 'pos' | 'def'
    matchId: string // The ID connecting the group (Word Family Code)
}

interface MatchingGameProps {
    batch: any[] // The raw question objects
    onComplete: () => void
    onError: (failedId: string) => void // Trigger "Group Penalty"
}

export default function MatchingGame({ batch, onComplete, onError }: MatchingGameProps) {
    const [leftCol, setLeftCol] = useState<MatchItem[]>([])
    const [midCol, setMidCol] = useState<MatchItem[]>([])
    const [rightCol, setRightCol] = useState<MatchItem[]>([])

    const [matchedIds, setMatchedIds] = useState<Set<string>>(new Set()) // Stores matchIds (Family IDs) that are fully cleared

    // Feedback State
    const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
    const [shaking, setShaking] = useState<string | null>(null) // ID of item to shake

    useEffect(() => {
        // Initialize Game: Shuffle and split
        const l: MatchItem[] = []
        const m: MatchItem[] = []
        const r: MatchItem[] = []

        batch.forEach(q => {
            // Assume q.content is "happy", q.answer is "adj. 快乐的"
            // We need to parse POS from answer if possible, or just split answer

            // Heuristic parsers:
            // "adj. 快乐的" -> POS: "adj.", Def: "快乐的"
            const posMatch = q.answer.match(/^([a-z]+\.)\s*(.*)/)
            const posText = posMatch ? posMatch[1] : "???"
            const defText = posMatch ? posMatch[2] : q.answer

            l.push({ id: `w-${q.id}`, text: q.content, type: 'word', matchId: q.id })
            m.push({ id: `p-${q.id}`, text: posText, type: 'pos', matchId: q.id })
            r.push({ id: `d-${q.id}`, text: defText, type: 'def', matchId: q.id })
        })

        setLeftCol(shuffle(l))
        setMidCol(shuffle(m))
        setRightCol(shuffle(r))
    }, [batch])

    const shuffle = (array: any[]) => {
        return [...array].sort(() => Math.random() - 0.5)
    }

    // 3-COLUMN MATCH LOGIC
    const [selections, setSelections] = useState<{
        word?: MatchItem,
        pos?: MatchItem,
        def?: MatchItem
    }>({})

    const onCardClick = (item: MatchItem, col: 'word' | 'pos' | 'def') => {
        // If this row (matchId) is already fully matched/gone, ignore
        if (matchedIds.has(item.matchId)) return

        const newSel = { ...selections, [col]: item }
        setSelections(newSel)

        // Check if we have all 3 selected
        if (newSel.word && newSel.pos && newSel.def) {
            checkTripleMatch(newSel.word, newSel.pos, newSel.def)
        }
    }

    const checkTripleMatch = (w: MatchItem, p: MatchItem, d: MatchItem) => {
        if (w.matchId === p.matchId && p.matchId === d.matchId) {
            // SUCCESS
            const id = w.matchId
            setMatchedIds(prev => new Set(prev).add(id))
            setSelections({}) // Clear

            setFeedback('correct')
            setTimeout(() => setFeedback(null), 500)

            // Check Game Complete
            if (matchedIds.size + 1 === batch.length) {
                confetti({
                    particleCount: 100,
                    spread: 70,
                    origin: { y: 0.6 }
                })
                setTimeout(onComplete, 2000)
            }
        } else {
            // FAIL
            // Shake all 3
            setShaking(`${w.id},${p.id},${d.id}`)
            setFeedback('wrong')

            // Trigger Penalty for ALL involved families (Strict!)
            onError(w.matchId)
            onError(p.matchId)
            onError(d.matchId)

            setTimeout(() => {
                setShaking(null)
                setSelections({}) // Reset
                setFeedback(null)
            }, 800)
        }
    }

    return (
        <div className="p-4 max-w-5xl mx-auto select-none">
            <h3 className="text-xl font-bold text-center mb-6 text-indigo-800 font-comic">
                🚀 连连看: 找到匹配的单词组合!
            </h3>

            <div className="grid grid-cols-3 gap-8">
                {/* Left: POS */}
                <div className="space-y-4">
                    <h4 className="text-center font-bold text-gray-500 mb-2">词性</h4>
                    {midCol.map(item => (
                        <Card
                            key={item.id}
                            item={item}
                            selected={selections.pos?.id === item.id}
                            matched={matchedIds.has(item.matchId)}
                            shake={shaking?.includes(item.id)}
                            onClick={() => onCardClick(item, 'pos')}
                            color="bg-pink-100 border-pink-300 text-pink-700"
                        />
                    ))}
                </div>

                {/* Center: Word */}
                <div className="space-y-4">
                    <h4 className="text-center font-bold text-gray-500 mb-2">单词</h4>
                    {leftCol.map(item => (
                        <Card
                            key={item.id}
                            item={item}
                            selected={selections.word?.id === item.id}
                            matched={matchedIds.has(item.matchId)}
                            shake={shaking?.includes(item.id)}
                            onClick={() => onCardClick(item, 'word')}
                            color="bg-blue-100 border-blue-300 text-blue-800 font-mono text-lg"
                        />
                    ))}
                </div>

                {/* Right: Definition */}
                <div className="space-y-4">
                    <h4 className="text-center font-bold text-gray-500 mb-2">词义</h4>
                    {rightCol.map(item => (
                        <Card
                            key={item.id}
                            item={item}
                            selected={selections.def?.id === item.id}
                            matched={matchedIds.has(item.matchId)}
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
                        className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    >
                        <CheckCircle className="w-32 h-32 text-green-500 drop-shadow-2xl" />
                    </motion.div>
                )}
                {feedback === 'wrong' && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1.2 }}
                        exit={{ opacity: 0 }}
                        className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
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
