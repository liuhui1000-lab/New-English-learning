"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase"
import { parseDocument, ParsedQuestion, ImportMode } from "@/lib/parser"
import { UploadCloud, Save, Trash, AlertTriangle, FileText, Check, BookOpen, Key } from "lucide-react"
import { QuestionType } from "@/types"

export default function ImportPage() {
    const [file, setFile] = useState<File | null>(null)
    const [questions, setQuestions] = useState<ParsedQuestion[]>([])
    const [isParsing, setIsParsing] = useState(false)
    const [importMode, setImportMode] = useState<ImportMode>('mock_paper') // Default to Mock Paper
    const [isSaving, setIsSaving] = useState(false)
    const [importStatus, setImportStatus] = useState<string | null>(null)

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0]
        if (selected) {
            setFile(selected)
            setIsParsing(true)
            try {
                // Pass the selected import mode to the parser
                const parsed = await parseDocument(selected, importMode)
                setQuestions(parsed)
            } catch (err: any) {
                alert("解析失败: " + err.message)
            } finally {
                setIsParsing(false)
            }
        }
    }

    const handleTypeChange = (id: string, newType: QuestionType) => {
        setQuestions(questions.map(q => q.id === id ? { ...q, type: newType } : q))
    }

    const handleDelete = (id: string) => {
        setQuestions(questions.filter(q => q.id !== id))
    }

    const handleSave = async () => {
        if (!file || questions.length === 0) return
        setIsSaving(true)
        setImportStatus("正在创建导入记录...")

        try {
            // 1. Get User ID
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error("未登录")

            // 2. Create Import History
            const { data: history, error: historyError } = await supabase
                .from('import_history')
                .insert({
                    filename: file.name,
                    question_count: questions.length,
                    uploaded_by: user.id
                })
                .select()
                .single()

            if (historyError) throw historyError

            // 3. Process Questions (Deduplication Check)
            setImportStatus("正在保存题目 (自动去重)...")

            const qData = questions.map(q => ({
                type: q.type,
                content: q.content,
                answer: q.answer,
                tags: q.tags,
                import_history_id: history.id,
                source_material_id: null,
                occurrence_count: 1
            }))

            const { error: batchError } = await supabase.from('questions').insert(qData)

            if (batchError) throw batchError

            setImportStatus("Success")
            alert("导入成功！")
            setQuestions([])
            setFile(null)

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
                        支持 .docx / .pdf
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
                        <div className={`p-2 rounded-full ${importMode === 'recitation' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                            <BookOpen className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900">背诵清单 / 单词表</h3>
                            <p className="text-sm text-gray-500">智能合并题目与答案。适合导入 Recitation 背诵材料。</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Upload Area */}
            {!questions.length && (
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:bg-gray-50 transition">
                    <input
                        type="file"
                        accept=".docx,.pdf"
                        onChange={handleFileChange}
                        className="hidden"
                        id="file-upload"
                    />
                    <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                        <UploadCloud className="h-12 w-12 text-gray-400 mb-4" />
                        <span className="text-indigo-600 font-medium hover:underline">
                            点击上传文件
                        </span>
                        <span className="text-gray-500 mt-2 text-sm">
                            {file ? `已选: ${file.name}` : "或将文件拖拽至此"}
                        </span>
                    </label>
                </div>
            )}

            {/* Parsing Status */}
            {isParsing && (
                <div className="text-center text-gray-600 py-10">
                    <div className="inline-block animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full mr-2"></div>
                    <p className="mt-2">正在智能解析文档... (PDF OCR 可能需要较长时间)</p>
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
                            <button onClick={() => handleBatchType('collocation')} className="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-100">固定搭配</button>
                            <button onClick={handleClearEmpty} className="px-2 py-1 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50 ml-2">清理空白项</button>
                        </div>

                        <div className="flex space-x-2 w-full sm:w-auto">
                            <button
                                onClick={() => {
                                    if (confirm("确定放弃当前解析结果吗？")) {
                                        setQuestions([]);
                                        setFile(null);
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
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/2">题目内容</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">分类</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">标签</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">参考答案</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {questions.map((q, idx) => (
                                    <tr key={q.id}>
                                        <td className="px-6 py-4">
                                            <textarea
                                                className="w-full text-base border-gray-300 rounded-md shadow-sm h-32 focus:ring-indigo-500 focus:border-indigo-500 font-mono"
                                                value={q.content}
                                                onChange={(e) => {
                                                    const newQ = [...questions];
                                                    newQ[idx].content = e.target.value;
                                                    setQuestions(newQ);
                                                }}
                                            />
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap align-top">
                                            <select
                                                className="block w-full text-sm border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                                value={q.type}
                                                onChange={(e) => handleTypeChange(q.id, e.target.value as QuestionType)}
                                            >
                                                <option value="vocabulary">词汇 (背诵)</option>
                                                <option value="word_transformation">词汇转换</option>
                                                <option value="collocation">固定搭配</option>
                                                <option value="grammar">语法选择</option>
                                            </select>
                                        </td>
                                        <td className="px-6 py-4 align-top">
                                            <input
                                                type="text"
                                                className="w-full text-sm border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                                placeholder="Tags..."
                                                value={q.tags.join(", ")}
                                                onChange={(e) => {
                                                    const newQ = [...questions];
                                                    newQ[idx].tags = e.target.value.split(",").map(t => t.trim()).filter(Boolean);
                                                    setQuestions(newQ);
                                                }}
                                            />
                                        </td>
                                        <td className="px-6 py-4 align-top">
                                            <textarea
                                                className="w-full text-sm border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                                placeholder="Answer..."
                                                value={q.answer}
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
