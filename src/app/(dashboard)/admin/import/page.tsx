"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase"
import { parseDocument, ParsedQuestion, ImportMode } from "@/lib/parser"
import { UploadCloud, Save, Trash, AlertTriangle, FileText, Check, BookOpen, Key } from "lucide-react"
import { QuestionType } from "@/types"

export default function ImportPage() {
    const [files, setFiles] = useState<File[]>([])
    const [questions, setQuestions] = useState<ParsedQuestion[]>([])
    const [isParsing, setIsParsing] = useState(false)
    const [importMode, setImportMode] = useState<ImportMode>('mock_paper') // Default to Mock Paper
    const [skipOCR, setSkipOCR] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [importStatus, setImportStatus] = useState<string | null>(null)

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(e.target.files || [])
        if (selectedFiles.length > 0) {

            if (selectedFiles.length > 5) {
                if (!confirm(`您选择了 ${selectedFiles.length} 个文件。建议单次上传 3-5 个以避免处理超时。\n是否继续？`)) return;
            }

            setFiles(selectedFiles)
            setIsParsing(true)
            setQuestions([]) // Clear previous results? Or append? Let's clear for new batch.

            try {
                let allQuestions: ParsedQuestion[] = []

                for (let i = 0; i < selectedFiles.length; i++) {
                    const file = selectedFiles[i]
                    setImportStatus(`正在解析第 ${i + 1}/${selectedFiles.length} 个文件: ${file.name}...`)

                    try {
                        const parsed = await parseDocument(file, importMode, (msg) => setImportStatus(msg), skipOCR)
                        // Add source filename to tags so we know where it came from
                        const tagged = parsed.map(q => ({
                            ...q,
                            tags: [...q.tags, `Source:${file.name}`]
                        }))
                        allQuestions = [...allQuestions, ...tagged]
                    } catch (err: any) {
                        console.error(`Failed to parse ${file.name}`, err)
                        alert(`文件 ${file.name} 解析失败: ${err.message}\n已跳过。`)
                    }
                }

                setQuestions(allQuestions)
                setImportStatus(null)

            } catch (err: any) {
                alert("批量解析中断: " + err.message)
            } finally {
                setIsParsing(false)
                setImportStatus(null)
            }
        }
    }

    // ... (rest of methods)

    // ... (inside render)
    {/* Upload Area */ }
    {
        !questions.length && (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:bg-gray-50 transition relative">
                <input
                    type="file"
                    multiple
                    accept=".docx,.pdf"
                    onChange={handleFileChange}
                    className="hidden"
                    id="file-upload"
                />
                <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                    <UploadCloud className="h-12 w-12 text-gray-400 mb-4" />
                    <span className="text-indigo-600 font-medium hover:underline">
                        点击上传文件 (支持批量)
                    </span>
                    <span className="text-gray-500 mt-2 text-sm">
                        {files.length > 0 ? `已选 ${files.length} 个文件` : "或将文件拖拽至此"}
                    </span>
                    <p className="text-xs text-orange-500 mt-4 border border-orange-200 bg-orange-50 px-3 py-1 rounded-full">
                        💡 建议单次上传 3-5 份试卷，避免 OCR/AI 处理超时
                    </p>
                </label>
            </div>
        )
    }

    {/* Parsing Status */ }
    {
        isParsing && (
            <div className="text-center text-gray-600 py-10">
                <div className="inline-block animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full mr-2"></div>
                <p className="mt-2 text-lg font-medium">{importStatus || "正在智能解析文档..."}</p>
                <p className="text-sm text-gray-400">PDF OCR 可能需要较长时间，请勿关闭页面</p>
            </div>
        )
    }

    const handleTypeChange = (id: string, newType: QuestionType) => {
        setQuestions(questions.map(q => q.id === id ? { ...q, type: newType } : q))
    }

    const handleDelete = (id: string) => {
        setQuestions(questions.filter(q => q.id !== id))
    }

    const handleSave = async () => {
        if (files.length === 0 || questions.length === 0) return
        setIsSaving(true)
        setImportStatus("正在创建导入记录...")

        try {
            // 1. Get User ID
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error("未登录")

            // 2. Group Questions by Source File
            // Using Map to group
            const groups = new Map<string, ParsedQuestion[]>()
            const defaultFilename = files.length === 1 ? files[0].name : `Batch Import ${new Date().toLocaleString()}`

            questions.forEach(q => {
                // Find source tag
                const sourceTag = q.tags.find(t => t.startsWith('Source:'))
                const filename = sourceTag ? sourceTag.replace('Source:', '') : defaultFilename

                if (!groups.has(filename)) groups.set(filename, [])
                groups.get(filename)?.push(q)
            })

            // 3. Save each group as separate history
            let processedCount = 0
            for (const [filename, groupQs] of groups) {
                setImportStatus(`归档中: ${filename} ...`)

                // Create History
                const { data: history, error: historyError } = await supabase
                    .from('import_history')
                    .insert({
                        filename: filename,
                        question_count: groupQs.length,
                        uploaded_by: user.id
                    })
                    .select()
                    .single()

                if (historyError) throw historyError

                // Insert Questions
                const qData = groupQs.map(q => ({
                    type: q.type,
                    content: q.content,
                    answer: q.answer,
                    tags: q.tags.filter(t => !t.startsWith('Source:')), // Optionally keep or remove source tag? Keep cleanliness.
                    import_history_id: history.id,
                    source_material_id: null,
                    occurrence_count: 1
                }))

                const { error: batchError } = await supabase.from('questions').insert(qData)
                if (batchError) throw batchError

                processedCount++
            }

            setImportStatus("Success")
            alert(`导入成功！共归档 ${processedCount} 个文件，${questions.length} 道题目。`)
            setQuestions([])
            setFiles([])

        } catch (err: any) {
            setImportStatus("Error")
            alert("保存失败: " + err.message)
        } finally {
            setIsSaving(false)
        }
    }

    const handleBatchType = (type: QuestionType) => {
        if (confirm(`确定要将所有题目类型设置为 "${type}" 吗？`)) {
            setQuestions(questions.map(q => ({ ...q, type })))
        }
    }

    const [isAnalyzing, setIsAnalyzing] = useState(false)

    // ... (existing handlers)

    const handleAIAnalyze = async () => {
        if (questions.length === 0) return
        if (!confirm(`即将发送 ${questions.length} 道题目给 AI 进行分析。\n这可能需要几十秒，请保持页面开启。`)) return

        setIsAnalyzing(true)
        setImportStatus("AI 分析中...")

        try {
            // Batch process to avoid Vercel timeouts (10s limit usually) and Token limits
            const BATCH_SIZE = 5
            const newQuestions = [...questions]

            for (let i = 0; i < newQuestions.length; i += BATCH_SIZE) {
                const batch = newQuestions.slice(i, i + BATCH_SIZE)
                // Only analyze if content is long enough (skip single words)
                // content array
                const items = batch.map(q => q.content)

                setImportStatus(`AI 分析中... (${i + 1}/${questions.length})`)

                const res = await fetch('/api/ai/analyze', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items, mode: 'tagging' })
                })

                if (!res.ok) {
                    const errData = await res.json().catch(() => ({ error: res.statusText }));
                    console.error(`Batch ${i} failed`, errData);

                    if (res.status === 429) {
                        alert(`AI 额度耗尽或请求过快 (Code 429)。\n已暂停。请稍后重试。`);
                        break;
                    }
                    if (res.status === 401) {
                        alert(`AI API Key 无效 (Code 401)。请检查设置。\n已暂停。`);
                        break;
                    }

                    // For other errors (500, etc), maybe ask user to continue?
                    if (!confirm(`批次 ${i / BATCH_SIZE + 1} 失败: ${errData.error}\n是否跳过此批次继续？`)) {
                        break;
                    }
                    continue;
                }

                const { results } = await res.json()

                // Merge AI results back to questions for the current batch
                results.forEach((r: any, idx: number) => {
                    const targetIndex = i + idx
                    if (newQuestions[targetIndex]) {
                        const q = newQuestions[targetIndex]
                        // Clean up and merge tags
                        const newTags = new Set(q.tags)
                        if (r.topic) newTags.add(`Topic:${r.topic}`)
                        if (r.key_point) newTags.add(`Point:${r.key_point}`)
                        if (r.difficulty) newTags.add(`Diff:${r.difficulty}`)

                        newQuestions[targetIndex] = {
                            ...q,
                            tags: Array.from(newTags),
                            // Auto-fill answer if empty
                            answer: (!q.answer && r.answer) ? r.answer : q.answer
                        }
                    } // Close if check
                }) // Close forEach

                // Small delay to be nice to API
                await new Promise(resolve => setTimeout(resolve, 500))
            }

            setQuestions(newQuestions)
            alert("AI 分析完成！已自动添加标签。")

        } catch (err: any) {
            alert("AI 分析中断: " + err.message)
        } finally {
            setIsAnalyzing(false)
            setImportStatus(null)
        }
    }

    const handleClearEmpty = () => {
        const count = questions.length;
        const newQ = questions.filter(q => q.content.trim().length > 0);
        if (newQ.length < count) {
            setQuestions(newQ);
            alert(`已清理 ${count - newQ.length} 个空题目`);
        } else {
            alert("没有发现空题目");
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">极速导入工作台</h2>
                <div className="flex items-center space-x-4">
                    <a href="/admin/import/history" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
                        查看历史记录 &rarr;
                    </a>
                    <div className="text-sm text-gray-500">
                        支持 .docx / .pdf (批量)
                    </div>
                </div>
            </div>

            {/* Mode Selection */}
            {!questions.length && !isParsing && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div
                        onClick={() => setImportMode('mock_paper')}
                        className={`cursor-pointer p-4 rounded-lg border-2 transition flex items-center space-x-4
                        ${importMode === 'mock_paper' ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                        <div className={`p-2 rounded-full ${importMode === 'mock_paper' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                            <FileText className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900">模拟卷 / 练习题</h3>
                            <p className="text-sm text-gray-500">自动过滤答案，只保留题目。适合导入试卷。</p>
                        </div>
                    </div>

                    <div
                        onClick={() => setImportMode('recitation')}
                        className={`cursor-pointer p-4 rounded-lg border-2 transition flex items-center space-x-4
                        ${importMode === 'recitation' ? 'border-green-600 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                        <div className={`p-2 rounded-full ${importMode === 'recitation' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                            <BookOpen className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-900">单词/句子背诵模式</h3>
                            <p className="text-sm text-gray-500">解析单词列表或同义句转换 (Recitation)</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Config Options */}
            {!questions.length && !isParsing && (
                <div className="flex items-center space-x-2 mb-4 bg-yellow-50 p-3 rounded border border-yellow-200">
                    <input
                        type="checkbox"
                        id="skipOCR"
                        checked={skipOCR}
                        onChange={(e) => setSkipOCR(e.target.checked)}
                        className="h-4 w-4 text-indigo-600 rounded"
                    />
                    <label htmlFor="skipOCR" className="text-sm text-gray-700 font-medium cursor-pointer">
                        仅提取文本 (跳过 OCR) <span className="text-gray-500 font-normal">- 处理速度快，但不适用于扫描图片版 PDF。如果你网络很慢且文件不是扫描件，请勾选此项。</span>
                    </label>
                </div>
            )}

            {/* Upload Area */}
            {!questions.length && (
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:bg-gray-50 transition relative">
                    <input
                        type="file"
                        multiple
                        accept=".docx,.pdf"
                        onChange={handleFileChange}
                        className="hidden"
                        id="file-upload"
                    />
                    <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                        <UploadCloud className="h-12 w-12 text-gray-400 mb-4" />
                        <span className="text-indigo-600 font-medium hover:underline">
                            点击上传文件 (支持批量)
                        </span>
                        <span className="text-gray-500 mt-2 text-sm">
                            {files.length > 0 ? `已选 ${files.length} 个文件` : "或将文件拖拽至此"}
                        </span>
                        <p className="text-xs text-orange-500 mt-4 border border-orange-200 bg-orange-50 px-3 py-1 rounded-full">
                            💡 建议单次上传 3-5 份试卷，避免 OCR/AI 处理超时
                        </p>
                    </label>
                </div>
            )}

            {/* Parsing Status */}
            {isParsing && (
                <div className="text-center text-gray-600 py-10">
                    <div className="inline-block animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full mr-2"></div>
                    <p className="mt-2 text-lg font-medium">{importStatus || "正在智能解析文档..."}</p>
                    <p className="text-sm text-gray-400">PDF OCR 可能需要较长时间，请勿关闭页面</p>
                </div>
            )}

            {/* Review Table */}
            {questions.length > 0 && (
                <div className="bg-white shadow rounded-lg overflow-hidden">
                    {/* Toolbar */}
                    <div className="p-4 border-b bg-gray-50 flex flex-col sm:flex-row justify-between items-center gap-4">
                        <div className="flex items-center space-x-2">
                            <h3 className="font-bold text-gray-700 mr-2">解析结果 ({questions.length} 题)</h3>
                            <span className="text-sm text-gray-500">批量设置类型:</span>
                            <button onClick={() => handleBatchType('grammar')} className="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-100">语法选择</button>
                            <button onClick={() => handleBatchType('word_transformation')} className="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-100">词汇转换</button>
                            <button onClick={() => handleBatchType('sentence_transformation')} className="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-100">句型转换</button>
                            <button onClick={() => handleBatchType('collocation')} className="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-100">固定搭配</button>
                            <button onClick={handleClearEmpty} className="px-2 py-1 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50 ml-2">清理空白项</button>
                            <button
                                onClick={handleAIAnalyze}
                                disabled={isAnalyzing}
                                className="px-3 py-1 text-xs bg-indigo-100 text-indigo-700 border border-indigo-200 rounded hover:bg-indigo-200 ml-2 flex items-center font-bold"
                            >
                                {isAnalyzing ? '分析中...' : '✨ AI 智能分析'}
                            </button>
                        </div>

                        <div className="flex space-x-2 w-full sm:w-auto">
                            <button
                                onClick={() => {
                                    if (confirm("确定放弃当前解析结果吗？")) {
                                        setQuestions([]);
                                        setFiles([]);
                                        setImportStatus(null);
                                    }
                                }}
                                className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-100 flex-1 sm:flex-none justify-center flex"
                            >
                                重新上传
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="bg-green-600 text-white px-6 py-2 rounded font-medium hover:bg-green-700 disabled:opacity-50 flex items-center shadow-sm flex-1 sm:flex-none justify-center"
                            >
                                {isSaving ? "保存中..." : <><Save className="w-4 h-4 mr-2" /> 确认入库 ({questions.length})</>}
                            </button>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[40%] min-w-[300px]">题目内容</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[120px]">分类</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-auto">标签</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[25%]">参考答案</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-[60px]">操作</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {questions.map((q, idx) => (
                                    <tr key={q.id}>
                                        <td className="px-6 py-4">
                                            <textarea
                                                className="w-full text-sm border-gray-300 rounded-md shadow-sm h-24 focus:ring-indigo-500 focus:border-indigo-500 font-mono"
                                                value={q.content}
                                                onChange={(e) => {
                                                    const newQ = [...questions];
                                                    newQ[idx].content = e.target.value;
                                                    setQuestions(newQ);
                                                }}
                                            />
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col space-y-2">
                                                <select
                                                    value={q.type}
                                                    onChange={(e) => {
                                                        const newQ = [...questions];
                                                        newQ[idx].type = e.target.value as QuestionType;
                                                        setQuestions(newQ);
                                                    }}
                                                    className="block w-full pl-2 pr-8 py-1 text-xs border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-md"
                                                >
                                                    <option value="grammar">语法选择</option>
                                                    <option value="word_transformation">词汇转换</option>
                                                    <option value="sentence_transformation">句型转换</option>
                                                    <option value="collocation">固定搭配</option>
                                                    <option value="vocabulary">词汇背诵</option>
                                                </select>
                                                <span className={`px-2 py-1 text-xs rounded-full inline-block text-center
                                                ${q.type === 'grammar' ? 'bg-blue-100 text-blue-800' :
                                                        q.type === 'word_transformation' ? 'bg-purple-100 text-purple-800' :
                                                            q.type === 'sentence_transformation' ? 'bg-orange-100 text-orange-800' :
                                                                'bg-gray-100 text-gray-800'}`}>
                                                    {q.type}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-wrap gap-1">
                                                {q.tags.map((tag, tIdx) => (
                                                    <span key={tIdx} className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-md border border-gray-200 flex items-center">
                                                        {tag}
                                                        <button
                                                            onClick={() => {
                                                                const newQ = [...questions];
                                                                newQ[idx].tags = newQ[idx].tags.filter((_, i) => i !== tIdx);
                                                                setQuestions(newQ);
                                                            }}
                                                            className="ml-1 text-gray-400 hover:text-red-500"
                                                        >
                                                            &times;
                                                        </button>
                                                    </span>
                                                ))}
                                                <input
                                                    type="text"
                                                    placeholder="+标签"
                                                    className="w-16 text-xs border-none bg-transparent focus:ring-0 text-gray-500 placeholder-gray-300"
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            const val = e.currentTarget.value.trim();
                                                            if (val) {
                                                                const newQ = [...questions];
                                                                if (!newQ[idx].tags.includes(val)) {
                                                                    newQ[idx].tags.push(val);
                                                                    setQuestions(newQ);
                                                                }
                                                                e.currentTarget.value = '';
                                                            }
                                                        }
                                                    }}
                                                />
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <textarea
                                                className="w-full text-sm border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 font-mono h-24"
                                                placeholder="参考答案..."
                                                value={q.answer || ''}
                                                onChange={(e) => {
                                                    const newQ = [...questions];
                                                    newQ[idx].answer = e.target.value;
                                                    setQuestions(newQ);
                                                }}
                                            />
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right align-top">
                                            <button
                                                onClick={() => handleDelete(q.id)}
                                                className="text-red-600 hover:text-red-900 p-2 hover:bg-red-50 rounded-full transition"
                                                title="删除此题"
                                            >
                                                <Trash className="w-5 h-5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}
