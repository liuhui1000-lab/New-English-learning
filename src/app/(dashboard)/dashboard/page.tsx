"use client"

import Link from "next/link"
import { BookOpen, PenTool, Upload, AlertCircle } from "lucide-react"

export default function StudentDashboardPage() {
    return (
        <div className="space-y-8">
            <h2 className="text-2xl font-bold text-gray-900">学习中心</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Study Mode */}
                <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-500 hover:shadow-md transition">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-900">背诵模式</h3>
                        <BookOpen className="text-blue-500 h-6 w-6" />
                    </div>
                    <p className="text-gray-600 text-sm mb-4">
                        记忆单词卡片与固定搭配。
                    </p>
                    <Link href="/dashboard/study" className="text-blue-600 font-semibold hover:underline text-sm">
                        开始背诵 &rarr;
                    </Link>
                </div>

                {/* Practice Mode */}
                <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-500 hover:shadow-md transition">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-900">练习模式</h3>
                        <PenTool className="text-green-500 h-6 w-6" />
                    </div>
                    <p className="text-gray-600 text-sm mb-4">
                        词汇转换 (5题/组) <br /> 语法/固搭 (10题/组)
                    </p>
                    <div className="flex space-x-4">
                        <Link href="/dashboard/practice?type=word_transformation" className="text-green-600 font-semibold hover:underline text-sm">
                            词转特训
                        </Link>
                        <Link href="/dashboard/practice?type=collocation" className="text-green-600 font-semibold hover:underline text-sm">
                            固搭闯关
                        </Link>
                    </div>
                </div>

                {/* Mistake Upload */}
                <div className="bg-white p-6 rounded-lg shadow border-l-4 border-orange-500 hover:shadow-md transition">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-900">错题上传</h3>
                        <Upload className="text-orange-500 h-6 w-6" />
                    </div>
                    <p className="text-gray-600 text-sm mb-4">
                        拍照上传错题，自动识别或存为卡片。
                    </p>
                    <Link href="/dashboard/upload" className="text-orange-600 font-semibold hover:underline text-sm">
                        立即上传 &rarr;
                    </Link>
                </div>
            </div>

            {/* Recent Mistakes / Reviews */}
            <div className="mt-8">
                <h3 className="text-xl font-bold text-gray-900 mb-4">待复习错题</h3>
                <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
                    <AlertCircle className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                    <p>暂时没有需要复习的错题！</p>
                </div>
            </div>
        </div>
    )
}
