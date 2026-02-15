"use client"

import { motion } from "framer-motion"
import { BookOpen, CheckCircle, Clock, Baby } from "lucide-react"

interface StudyStats {
    total: number
    mastered: number
    reviewing: number
    learning: number
    new: number
}

interface StudyStatsCardProps {
    stats: StudyStats
    loading?: boolean
}

export default function StudyStatsCard({ stats, loading }: StudyStatsCardProps) {
    if (loading) return <div className="animate-pulse bg-gray-100 h-40 rounded-xl" />

    const percentage = stats.total > 0 ? Math.round(((stats.mastered + stats.reviewing) / stats.total) * 100) : 0

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h3 className="text-lg font-bold text-gray-800">背诵进度</h3>
                    <p className="text-sm text-gray-500">累计收录单词 {stats.total} 个</p>
                </div>
                <div className="bg-indigo-50 p-2 rounded-lg">
                    <BookOpen className="w-6 h-6 text-indigo-600" />
                </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>总体掌握率</span>
                    <span className="font-bold text-indigo-600">{percentage}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden flex">
                    <div className="bg-green-500 h-full" style={{ width: `${(stats.mastered / stats.total) * 100}%` }} />
                    <div className="bg-yellow-400 h-full" style={{ width: `${(stats.reviewing / stats.total) * 100}%` }} />
                    <div className="bg-blue-400 h-full" style={{ width: `${(stats.learning / stats.total) * 100}%` }} />
                </div>
            </div>

            {/* Grid Stats */}
            <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                <div className="bg-green-50 rounded-lg p-2">
                    <CheckCircle className="w-4 h-4 text-green-500 mx-auto mb-1" />
                    <div className="text-xl font-bold text-gray-800">{stats.mastered}</div>
                    <div className="text-xs text-gray-500">已掌握</div>
                </div>
                <div className="bg-yellow-50 rounded-lg p-2">
                    <Clock className="w-4 h-4 text-yellow-500 mx-auto mb-1" />
                    <div className="text-xl font-bold text-gray-800">{stats.reviewing}</div>
                    <div className="text-xs text-gray-500">复习中</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-2">
                    <Baby className="w-4 h-4 text-blue-500 mx-auto mb-1" />
                    <div className="text-xl font-bold text-gray-800">{stats.learning}</div>
                    <div className="text-xs text-gray-500">新学</div>
                </div>
            </div>
        </div>
    )
}
