"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { FileDown, AlertTriangle, CheckCircle, RefreshCw, Trash, MoreVertical, ChevronDown } from "lucide-react"
import SmartTooltip from "@/components/SmartTooltip"
import { Menu, Transition } from '@headlessui/react'
import { Fragment } from 'react'

export default function ErrorNotebookPage() {
    const [mistakes, setMistakes] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<'all' | 'recitation' | 'quiz'>('all')
    const [selectedType, setSelectedType] = useState<string>('all')
    const [selectedTopic, setSelectedTopic] = useState<string>('all')
    const [sort, setSort] = useState<'date_desc' | 'date_asc' | 'count_desc' | 'az_asc'>('date_desc')

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    useEffect(() => {
        fetchMistakes()
    }, [])

    const fetchMistakes = async () => {
        setLoading(true)
        const allMistakes: any[] = []

        // 1. Fetch Recitation Mistakes (ONLY from Word Transformation Recitation flow)
        // Only include vocabulary and word_transformation recorded in user_progress
        const { data: recitationData } = await supabase
            .from('user_progress')
            .select(`
                *,
                questions (
                    id, content, answer, type, tags
                )
            `)
            .in('questions.type', ['vocabulary', 'word_transformation'])
            .eq('status', 'learning')
            .gt('attempts', 0)

        if (recitationData) {
            recitationData.forEach((record: any) => {
                if (!record.questions) return
                const qType = record.questions.type

                allMistakes.push({
                    id: record.questions.id,
                    content: record.questions.content,
                    answer: record.questions.answer,
                    type: 'recitation', // Strictly source-based
                    note: qType === 'word_transformation' ? '词汇变形' : '单词拼写',
                    count: record.attempts,
                    tags: record.questions.tags || []
                })
            })
        }

        // 2. Fetch Quiz Mistakes (ONLY from Practice/Mock paper source)
        const { data: quizData } = await supabase
            .from('quiz_results')
            .select(`
                id, answer, attempt_at, question_id,
                questions (
                    id, content, answer, type, explanation, tags
                )
            `)
            .eq('is_correct', false)
            .order('attempt_at', { ascending: true })
            .limit(200)

        if (quizData) {
            const grouped = new Map<string, any>()
            quizData.forEach((record: any) => {
                const qId = record.questions?.id
                if (!qId) return

                if (!grouped.has(qId)) {
                    const qType = record.questions.type
                    grouped.set(qId, {
                        id: qId,
                        content: record.questions.content,
                        answer: record.questions.answer,
                        type: 'quiz', // Strictly source-based
                        note: qType === 'word_transformation' ? '词汇变形' :
                            qType === 'vocabulary' ? '单词拼写' :
                                qType === 'grammar' ? '语法' :
                                    qType === 'sentence_transformation' ? '句型转换' : '词组搭配',
                        explanation: record.questions.explanation,
                        tags: record.questions.tags,
                        lastAttempt: record.attempt_at,
                        wrongAttempts: []
                    })
                }
                const item = grouped.get(qId)
                item.wrongAttempts.push({
                    id: record.id,
                    answer: record.answer,
                    attempt_at: record.attempt_at
                })
                if (record.attempt_at > item.lastAttempt) item.lastAttempt = record.attempt_at
            })

            grouped.forEach(item => {
                item.count = item.wrongAttempts.length
                allMistakes.push(item)
            })
        }

        setMistakes(allMistakes)
        setLoading(false)
    }

    const filteredMistakes = mistakes
        .filter(m => {
            // 1. Primary Filter (Tab)
            if (filter !== 'all' && m.type !== filter) return false

            // 2. Type Filter (Subtype/Note)
            if (selectedType !== 'all' && m.note !== selectedType) return false

            // 3. Topic Filter
            if (selectedTopic !== 'all') {
                const hasTopic = m.tags?.some((t: string) => t === `Topic:${selectedTopic}`)
                if (!hasTopic) return false
            }

            return true
        })
        .sort((a, b) => {
            switch (sort) {
                case 'date_desc':
                    return new Date(b.lastAttempt || 0).getTime() - new Date(a.lastAttempt || 0).getTime()
                case 'date_asc':
                    return new Date(a.lastAttempt || 0).getTime() - new Date(b.lastAttempt || 0).getTime()
                case 'count_desc':
                    return b.count - a.count
                case 'az_asc':
                    return a.content.localeCompare(b.content)
                default:
                    return 0
            }
        })

    // Extract Available Options
    const availableTypes = Array.from(new Set(mistakes.map(m => m.note))).filter(Boolean).sort()

    const availableTopics = Array.from(new Set(
        mistakes.flatMap(m => m.tags || [])
            .filter((t: string) => t.startsWith('Topic:'))
            .map((t: string) => t.replace('Topic:', ''))
    )).sort()

    const [analyzing, setAnalyzing] = useState(false)
    const [report, setReport] = useState<string | null>(null)

    const handlePrint = () => {
        window.print()
    }

    const handleExportPDF = async () => {
        if (filteredMistakes.length === 0) {
            alert('当前没有错题可导出')
            return
        }
        alert('正在生成 PDF，请稍候...')

        const [{ jsPDF }, html2canvas] = await Promise.all([
            import('jspdf'),
            import('html2canvas').then(m => m.default)
        ])

        // Build an off-screen div with the full content
        const container = document.createElement('div')
        container.style.cssText = `
            position: fixed; left: -9999px; top: 0;
            width: 794px; padding: 40px;
            font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
            font-size: 14px; color: #111; background: #fff; line-height: 1.6;
        `
        // Title
        const title = document.createElement('div')
        title.innerHTML = `
            <h1 style="font-size:22px;font-weight:bold;margin:0 0 4px">错题本</h1>
            <p style="font-size:11px;color:#888;margin:0 0 24px">
                导出时间: ${new Date().toLocaleString('zh-CN')} &nbsp;|&nbsp; 共 ${filteredMistakes.length} 道题
            </p>
        `
        container.appendChild(title)

        filteredMistakes.forEach((item, idx) => {
            const card = document.createElement('div')
            card.style.cssText = 'margin-bottom:20px; padding-bottom:16px; border-bottom:1px solid #e5e7eb;'

            // Header
            const meta = document.createElement('div')
            meta.style.cssText = 'font-size:10px; color:#6366f1; font-weight:bold; margin-bottom:4px;'
            meta.textContent = `#${idx + 1}  ${item.note || item.type}${item.count > 1 ? `  ×${item.count} 次出错` : ''}`
            card.appendChild(meta)

            // Question
            const q = document.createElement('div')
            q.style.cssText = 'font-size:14px; font-weight:600; margin-bottom:8px; color:#111;'
            q.textContent = item.content
            card.appendChild(q)

            // Wrong attempts
            if (item.wrongAttempts && item.wrongAttempts.length > 0) {
                item.wrongAttempts.forEach((attempt: any) => {
                    const row = document.createElement('div')
                    row.style.cssText = `
                        display:flex; gap:8px; align-items:baseline;
                        background:#fef2f2; border:1px solid #fecaca;
                        border-radius:6px; padding:4px 10px; margin-bottom:4px;
                        font-size:12px;
                    `
                    const date = new Date(attempt.attempt_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                    row.innerHTML = `
                        <span style="color:#9ca3af;white-space:nowrap">${date}</span>
                        <span style="color:#dc2626;text-decoration:line-through">${attempt.answer || '（未作答）'}</span>
                    `
                    card.appendChild(row)
                })
            }

            // Correct answer
            const ans = document.createElement('div')
            ans.style.cssText = 'font-size:13px; color:#16a34a; font-weight:600; margin-top:6px;'
            ans.textContent = `✓  ${item.answer}`
            card.appendChild(ans)

            // Explanation
            if (item.explanation) {
                const exp = document.createElement('div')
                exp.style.cssText = 'font-size:11px; color:#6b7280; font-style:italic; margin-top:4px; padding-left:8px;'
                exp.textContent = `💡 ${item.explanation}`
                card.appendChild(exp)
            }

            container.appendChild(card)
        })

        document.body.appendChild(container)

        try {
            const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
            document.body.removeChild(container)

            const imgW = 210 // A4 mm width
            const pageH = 297 // A4 mm height
            const margin = 10
            const contentW = imgW - margin * 2
            const imgRatio = canvas.height / canvas.width
            const fullH = contentW * imgRatio // total rendered height in mm

            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
            const contentPageH = pageH - margin * 2
            let sliceY = 0 // in mm

            while (sliceY < fullH) {
                if (sliceY > 0) doc.addPage()

                // Convert mm slice to canvas pixel coordinates
                const pixPerMm = canvas.width / contentW
                const sliceYpx = sliceY * pixPerMm
                const sliceHpx = Math.min(contentPageH * pixPerMm, canvas.height - sliceYpx)

                // Crop canvas slice
                const sliceCanvas = document.createElement('canvas')
                sliceCanvas.width = canvas.width
                sliceCanvas.height = sliceHpx
                const ctx = sliceCanvas.getContext('2d')!
                ctx.drawImage(canvas, 0, sliceYpx, canvas.width, sliceHpx, 0, 0, canvas.width, sliceHpx)

                const sliceImg = sliceCanvas.toDataURL('image/jpeg', 0.92)
                const sliceHmm = sliceHpx / pixPerMm
                doc.addImage(sliceImg, 'JPEG', margin, margin, contentW, sliceHmm)
                sliceY += contentPageH
            }

            doc.save(`error-notebook-${new Date().toISOString().slice(0, 10)}.pdf`)
        } catch (err: any) {
            if (document.body.contains(container)) document.body.removeChild(container)
            alert('PDF 生成失败: ' + err.message)
        }
    }

    const handleAnalyze = async () => {
        if (filteredMistakes.length === 0) {
            alert("请先筛选出需要分析的错题")
            return
        }
        if (!confirm(`即将分析当前列表中的 ${filteredMistakes.length} 道错题。可能需要几十秒钟，请耐心等待。`)) return

        setAnalyzing(true)
        setReport(null)
        try {
            // --- Smart Sampling Strategy ---

            // 1. Sort by Date Descending to get "Recent" candidates
            const sortedByDate = [...filteredMistakes].sort((a, b) =>
                new Date(b.lastAttempt || 0).getTime() - new Date(a.lastAttempt || 0).getTime()
            )
            const recentCandidates = sortedByDate.slice(0, 10)
            const recentIds = new Set(recentCandidates.map(m => m.id))

            // 2. Count Tag Frequencies (Topic & Point)
            const tagCounts = new Map<string, number>()
            filteredMistakes.forEach(m => {
                if (m.tags && Array.isArray(m.tags)) {
                    m.tags.forEach((t: string) => {
                        // Only count meaningful tags (Topic/Point), ignore Difficulty
                        if (t.startsWith('Topic:') || t.startsWith('Point:')) {
                            tagCounts.set(t, (tagCounts.get(t) || 0) + 1)
                        }
                    })
                }
            })

            // 3. Select High-Frequency Mistakes
            // Filter out mistakes that are already in "recentResults"
            const remainingMistakes = filteredMistakes.filter(m => !recentIds.has(m.id))

            // Sort remaining mistakes by their "Tag Score" (sum of weights of their tags)
            const frequentCandidates = remainingMistakes.map(m => {
                let score = 0
                if (m.tags && Array.isArray(m.tags)) {
                    m.tags.forEach((t: string) => {
                        score += (tagCounts.get(t) || 0)
                    })
                }
                // Fallback: if no tags, use Note/Type as a proxy
                if (score === 0 && m.note) score = 1
                return { ...m, score }
            })
                .sort((a, b) => b.score - a.score) // High score first
                .slice(0, 10) // Take top 10

            // 4. Construct Payload
            const payload = {
                recent: recentCandidates.map(m => ({
                    content: m.content,
                    answer: m.answer,
                    user_error_count: m.count,
                    tags: m.tags || []
                })),
                frequent: frequentCandidates.map(m => ({
                    content: m.content,
                    answer: m.answer,
                    user_error_count: m.count,
                    tags: m.tags || []
                }))
            }

            const res = await fetch('/api/ai/analyze-errors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            if (!res.ok) throw new Error(await res.text())

            const data = await res.json()
            setReport(data.report)
        } catch (e: any) {
            alert("分析失败: " + e.message)
        } finally {
            setAnalyzing(false)
        }
    }

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

    // Actions
    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            const newSet = new Set<string>()
            filteredMistakes.forEach(m => newSet.add(m.id))
            setSelectedIds(newSet)
        } else {
            setSelectedIds(new Set())
        }
    }

    const handleSelectOne = (id: string) => {
        const newSet = new Set(selectedIds)
        if (newSet.has(id)) newSet.delete(id)
        else newSet.add(id)
        setSelectedIds(newSet)
    }

    // Delete a single wrong attempt entry by its quiz_results.id
    const handleDeleteAttempt = async (attemptId: string, questionId: string) => {
        if (!confirm('删除这条错误记录？')) return
        setLoading(true)
        try {
            const { error } = await supabase.from('quiz_results').delete().eq('id', attemptId)
            if (error) throw error
            fetchMistakes()
        } catch (e: any) {
            alert('删除失败: ' + e.message)
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (mode: 'selected' | 'all') => {
        const targets = mode === 'selected' ? filteredMistakes.filter(m => selectedIds.has(m.id)) : filteredMistakes
        if (targets.length === 0) return

        let confirmMsg = ''
        if (mode === 'all') {
            if (filter === 'all') {
                confirmMsg = `⚠️ 高风险操作\n\n确定要清空【所有类型】的错题吗？\n这将同时删除所有练习记录和背诵进度，共 ${targets.length} 条数据。`
            } else {
                confirmMsg = `确定要清空当前分类下的 ${targets.length} 条记录吗？`
            }
        } else {
            confirmMsg = `确定要删除这 ${targets.length} 条记录吗？\n删除后，对应题目的错误次数将减 1，首页统计也会同步更新。`
        }

        if (!confirm(confirmMsg)) return

        setLoading(true)
        try {
            // Group by type for efficient deletion
            const quizIds = targets.filter(m => m.type === 'quiz').map(m => m.row_id) // We need row_id for quiz_results unique deletion
            const recitationIds = targets.filter(m => m.type === 'recitation').map(m => m.id) // question_id for user_progress

            // 1. Delete Quiz Results (Hard Delete)
            if (quizIds.length > 0) {
                const { error } = await supabase
                    .from('quiz_results')
                    .delete()
                    .in('id', quizIds)
                if (error) throw error
            }

            // 2. Reset Recitation Progress (Soft Delete / Reset)
            if (recitationIds.length > 0) {
                const { data: { user } } = await supabase.auth.getUser()
                if (user) {
                    // Update to 'mastered' or just reset attempts? 
                    // Analyzed requirement: "Remove from mistake list". 
                    // Resetting attempts to 0 removes it from "mistakes" (since we filter by attempts > 0)
                    // But maybe we should just set status to 'reviewing' and attempts=0
                    const { error } = await supabase
                        .from('user_progress')
                        .update({ attempts: 0, status: 'reviewing', next_review_at: new Date().toISOString() })
                        .in('question_id', recitationIds)
                        .eq('user_id', user.id)

                    if (error) throw error
                }
            }

            alert("删除成功")
            setSelectedIds(new Set())
            fetchMistakes()

        } catch (e: any) {
            console.error(e)
            alert("操作失败: " + e.message)
        } finally {
            setLoading(false)
        }
    }

    const handleMastered = async (id: string) => {
        if (!confirm("确定已完全掌握该题吗？\n这将清空该题【所有】历史错误记录，并标记为已掌握。")) return

        setLoading(true)
        try {
            // 1. Deep Cleanup Quiz Results (Delete ALL historical logs for this question)
            const { error: quizError } = await supabase
                .from('quiz_results')
                .delete()
                .eq('question_id', id)

            if (quizError) throw quizError

            // 2. Mark User Progress as Mastered
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const { error: progressError } = await supabase
                    .from('user_progress')
                    .upsert({
                        user_id: user.id,
                        question_id: id,
                        status: 'mastered',
                        attempts: 0,
                        last_attempt_at: new Date().toISOString(),
                        next_review_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
                    })

                if (progressError) throw progressError
            }

            alert("已标记为掌握，历史错误频率已归零")
            setSelectedIds(new Set())
            fetchMistakes()

        } catch (e: any) {
            console.error(e)
            alert("操作失败: " + e.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
                <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-bold text-gray-900">错题本</h2>
                    <span className="bg-gray-100 text-gray-500 text-xs px-2 py-1 rounded-full font-medium">
                        共 {mistakes.length} 道题
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={handleAnalyze}
                        disabled={analyzing}
                        className="bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2 rounded-lg flex items-center shadow-sm transition disabled:opacity-50 text-sm font-medium"
                    >
                        {analyzing ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                        智能分析
                    </button>

                    <Menu as="div" className="relative">
                        <Menu.Button className="bg-white border border-gray-300 text-gray-700 p-2 rounded-lg hover:bg-gray-50 transition">
                            <MoreVertical className="w-5 h-5" />
                        </Menu.Button>
                        <Transition
                            as={Fragment}
                            enter="transition ease-out duration-100"
                            enterFrom="transform opacity-0 scale-95"
                            enterTo="transform opacity-100 scale-100"
                            leave="transition ease-in duration-75"
                            leaveFrom="transform opacity-100 scale-100"
                            leaveTo="transform opacity-0 scale-95"
                        >
                            <Menu.Items className="absolute right-0 mt-2 w-48 origin-top-right bg-white divide-y divide-gray-100 rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
                                <div className="px-1 py-1">
                                    <Menu.Item>
                                        {({ active }) => (
                                            <button onClick={fetchMistakes} className={`${active ? 'bg-indigo-50 text-indigo-600' : 'text-gray-700'} group flex w-full items-center rounded-md px-2 py-2 text-sm`}>
                                                <RefreshCw className="mr-2 h-4 w-4" /> 刷新数据
                                            </button>
                                        )}
                                    </Menu.Item>
                                    <Menu.Item>
                                        {({ active }) => (
                                            <button onClick={handlePrint} className={`${active ? 'bg-indigo-50 text-indigo-600' : 'text-gray-700'} group flex w-full items-center rounded-md px-2 py-2 text-sm`}>
                                                <FileDown className="mr-2 h-4 w-4" /> 打印
                                            </button>
                                        )}
                                    </Menu.Item>
                                    <Menu.Item>
                                        {({ active }) => (
                                            <button onClick={handleExportPDF} className={`${active ? 'bg-indigo-50 text-indigo-600' : 'text-gray-700'} group flex w-full items-center rounded-md px-2 py-2 text-sm`}>
                                                <FileDown className="mr-2 h-4 w-4" /> 导出 PDF
                                            </button>
                                        )}
                                    </Menu.Item>
                                </div>
                                <div className="px-1 py-1">
                                    <Menu.Item>
                                        {({ active }) => (
                                            <button onClick={() => handleDelete('all')} className={`${active ? 'bg-red-50 text-red-600' : 'text-red-500'} group flex w-full items-center rounded-md px-2 py-2 text-sm`}>
                                                <Trash className="mr-2 h-4 w-4" /> 清空本子
                                            </button>
                                        )}
                                    </Menu.Item>
                                </div>
                            </Menu.Items>
                        </Transition>
                    </Menu>
                </div>
            </div>

            {/* Bulk Actions Sticky Bar */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-8">
                    <div className="bg-gray-900/90 backdrop-blur text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-6 border border-gray-700">
                        <span className="text-sm font-medium border-r border-gray-700 pr-6">已选 {selectedIds.size} 项</span>
                        <div className="flex gap-4">
                            <button
                                onClick={async () => {
                                    if (!confirm(`确定要将选中的 ${selectedIds.size} 道题标记为掌握吗？`)) return
                                    for (const id of Array.from(selectedIds)) {
                                        await handleMastered(id)
                                    }
                                }}
                                className="text-sm text-green-400 hover:text-green-300 flex items-center font-bold"
                            >
                                <CheckCircle className="w-4 h-4 mr-1" /> 批量掌握
                            </button>
                            <button
                                onClick={() => handleDelete('selected')}
                                className="text-sm text-red-400 hover:text-red-300 flex items-center font-bold"
                            >
                                <Trash className="w-4 h-4 mr-1" /> 批量删除
                            </button>
                            <button
                                onClick={() => setSelectedIds(new Set())}
                                className="text-sm text-gray-400 hover:text-white"
                            >
                                取消
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* AI Report Section */}
            {report && (
                <div className="bg-gradient-to-br from-indigo-50 to-white p-6 rounded-xl border border-indigo-100 shadow-sm animate-in fade-in slide-in-from-top-4 mb-6 relative">
                    <button
                        onClick={() => setReport(null)}
                        className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                    >
                        ✕
                    </button>
                    <div className="flex items-center mb-4 border-b border-indigo-100 pb-2">
                        <CheckCircle className="w-5 h-5 mr-2 text-indigo-600" />
                        <h3 className="text-lg font-bold text-indigo-900">AI 学习诊断报告</h3>
                    </div>
                    <div className="prose prose-indigo prose-sm max-w-none text-gray-700 leading-relaxed font-sans">
                        <pre className="whitespace-pre-wrap font-sans bg-transparent border-0 p-0 text-gray-800">{report}</pre>
                    </div>
                </div>
            )}

            {/* Filter Tabs */}
            {/* Filter & Sort Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-center print:hidden border-b border-gray-200 pb-4 gap-4">
                <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
                    {['all', 'recitation', 'quiz'].map((t) => (
                        <button
                            key={t}
                            onClick={() => setFilter(t as any)}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition capitalize ${filter === t ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            {t === 'all' ? `全部 (${mistakes.length})` : t === 'recitation' ? '词转背诵回顾' : '练习/错题库'}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-4">
                    {/* Advanced Filters */}
                    <div className="flex gap-2">
                        <select
                            value={selectedType}
                            onChange={(e) => setSelectedType(e.target.value)}
                            className="text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-1.5 pl-3 pr-8"
                        >
                            <option value="all">所有题型</option>
                            {availableTypes.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>

                        <select
                            value={selectedTopic}
                            onChange={(e) => setSelectedTopic(e.target.value)}
                            className="text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-1.5 pl-3 pr-8 max-w-[150px]"
                        >
                            <option value="all">所有话题</option>
                            {availableTopics.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>

                    {/* Sort Dropdown */}
                    <div className="relative flex items-center">
                        <span className="text-sm text-gray-500 mr-2">排序:</span>
                        <select
                            value={sort}
                            onChange={(e) => setSort(e.target.value as any)}
                            className="text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-1.5 pl-3 pr-8"
                        >
                            <option value="date_desc">📅 最近出错</option>
                            <option value="date_asc">⏳ 最早出错</option>
                            <option value="count_desc">🔥 写错次数 (高→低)</option>
                            <option value="az_asc">🔤 字母顺序 (A-Z)</option>
                        </select>
                    </div>

                    <div className="flex items-center">
                        <input
                            type="checkbox"
                            id="selectAll"
                            checked={filteredMistakes.length > 0 && selectedIds.size >= filteredMistakes.length}
                            onChange={handleSelectAll}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 mr-2"
                        />
                        <label htmlFor="selectAll" className="text-sm text-gray-600 cursor-pointer select-none">全选</label>
                    </div>
                </div>
            </div>

            {/* Print Header */}
            <div className="hidden print:block text-center mb-8">
                <h1 className="text-3xl font-bold text-gray-900">错题特训清单</h1>
                <p className="text-gray-500 mt-2">Generated by English Learning App</p>
            </div>

            {loading ? (
                <div className="text-center py-20 text-gray-500 animate-pulse">
                    正在加载数据...
                </div>
            ) : filteredMistakes.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-lg border border-dashed border-gray-300">
                    <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900">太棒了！</h3>
                    <p className="text-gray-500">暂时没有发现错题，继续保持！</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {filteredMistakes.map((item, idx) => (
                        <div
                            key={`${item.type}-${item.id}-${idx}`}
                            className={`bg-white p-5 rounded-lg shadow-sm border transition-all break-inside-avoid relative group
                                ${selectedIds.has(item.id) ? 'border-indigo-300 ring-1 ring-indigo-300 bg-indigo-50/30' : 'border-gray-200 hover:border-indigo-200'}
                            `}
                        >
                            <div className="absolute top-4 right-4 print:hidden">
                                <input
                                    type="checkbox"
                                    checked={selectedIds.has(item.id)}
                                    onChange={() => handleSelectOne(item.id)}
                                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-5 h-5 cursor-pointer"
                                />
                            </div>

                            <div className="flex justify-between items-start mb-2 pr-8">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-mono text-gray-400">#{idx + 1}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.type === 'recitation' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                                        }`}>
                                        {item.note}
                                    </span>
                                    {item.count > 1 && (
                                        <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                                            错 {item.count} 次
                                        </span>
                                    )}
                                </div>
                                <span className="text-xs text-gray-400">
                                    {new Date(item.lastAttempt || Date.now()).toLocaleDateString()}
                                </span>
                            </div>

                            {/* Question content */}
                            <div className="mb-3 pr-8">
                                <h4 className="font-serif text-lg text-gray-900 leading-relaxed font-medium">
                                    {item.content}
                                </h4>
                            </div>

                            {/* Wrong attempt history - only for quiz type */}
                            {item.type === 'quiz' && item.wrongAttempts && item.wrongAttempts.length > 0 && (
                                <div className="mb-3 space-y-1.5">
                                    {item.wrongAttempts.map((attempt: any) => (
                                        <div key={attempt.id} className="flex items-start justify-between gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2 group/attempt">
                                            <div className="flex-1 min-w-0">
                                                <span className="text-[10px] text-gray-400 block mb-0.5">
                                                    {new Date(attempt.attempt_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                <span className="text-sm text-red-600 font-medium line-through decoration-red-300">
                                                    {attempt.answer || '（未作答）'}
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => handleDeleteAttempt(attempt.id, item.id)}
                                                className="opacity-0 group-hover/attempt:opacity-100 transition text-red-300 hover:text-red-500 p-0.5 shrink-0 print:hidden"
                                                title="删除这条记录"
                                            >
                                                <Trash className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Correct answer + explanation */}
                            <div className="pt-3 border-t border-gray-100">
                                <div className="flex items-start justify-between">
                                    <div className="text-green-700 font-medium text-sm flex items-start flex-1 mr-4">
                                        <span className="text-gray-400 text-xs mr-2 mt-0.5 shrink-0">✓</span>
                                        <span>{item.answer}</span>
                                    </div>
                                    <button
                                        onClick={() => handleMastered(item.id)}
                                        className="text-xs bg-green-600 text-white hover:bg-green-700 px-4 py-1.5 rounded-full shadow-sm transition font-bold shrink-0 print:hidden"
                                    >
                                        已掌握
                                    </button>
                                </div>
                                {item.explanation && (
                                    <div className="mt-2 text-[12px] text-gray-500 italic bg-gray-50 p-2 rounded leading-snug">
                                        💡 {item.explanation}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
