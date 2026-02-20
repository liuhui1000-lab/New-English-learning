"use client"

import { motion } from "framer-motion"
import { Target, Trophy, XCircle } from "lucide-react"

interface QuizStats {
    totalAttempts: number
    correctCount: number
    errorCount: number
}

interface QuizStatsCardProps {
    stats: QuizStats
    loading?: boolean
}

export default function QuizStatsCard({ stats, loading }: QuizStatsCardProps) {
    if (loading) return <div className="animate-pulse bg-gray-100 h-40 rounded-xl" />

    const accuracy = stats.totalAttempts > 0
        ? Math.round((stats.correctCount / stats.totalAttempts) * 100)
        : 0

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h3 className="text-lg font-bold text-gray-800">练习战绩</h3>
                    <p className="text-sm text-gray-500">累计答题 {stats.totalAttempts} 次</p>
                </div>
                <div className="bg-purple-50 p-2 rounded-lg">
                    <Target className="w-6 h-6 text-purple-600" />
                </div>
            </div>

            <div className="flex items-center justify-between mt-6">
                {/* Accuracy Circle */}
                <div className="relative w-24 h-24 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                        <circle
                            cx="48" cy="48" r="40"
                            stroke="currentColor" strokeWidth="8"
                            fill="transparent" className="text-gray-100"
                        />
                        <circle
                            cx="48" cy="48" r="40"
                            stroke="currentColor" strokeWidth="8"
                            fill="transparent" className="text-purple-600 transition-all duration-1000 ease-out"
                            strokeDasharray={251.2}
                            strokeDashoffset={251.2 - (251.2 * accuracy) / 100}
                            strokeLinecap="round"
                        />
                    </svg>
                    <div className="absolute flex flex-col items-center">
                        <span className="text-2xl font-bold text-gray-800">{accuracy}%</span>
                        <span className="text-xs text-gray-400">正确率</span>
                    </div>
                </div>

                {/* Details */}
                <div className="flex flex-col gap-3 flex-1 ml-6">
                    <div className="flex justify-between items-center bg-green-50 px-3 py-2 rounded-lg">
                        <div className="flex items-center gap-2">
                            <Trophy className="w-4 h-4 text-green-600" />
                            <span className="text-sm font-medium text-gray-700">正确</span>
                        </div>
                        <span className="font-bold text-green-600">{stats.correctCount}</span>
                    </div>
                    <div className="flex justify-between items-center bg-red-50 px-3 py-2 rounded-lg">
                        <div className="flex items-center gap-2">
                            <XCircle className="w-4 h-4 text-red-600" />
                            <span className="text-sm font-medium text-gray-700">累计错误次</span>
                        </div>
                        <span className="font-bold text-red-600">{stats.errorCount}</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
