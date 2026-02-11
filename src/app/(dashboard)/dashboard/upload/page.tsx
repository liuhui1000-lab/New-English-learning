"use client"

import { useState, useRef } from "react"
import Compressor from "compressorjs"
import { supabase } from "@/lib/supabase"
import { Camera, RefreshCw, Save, Image as ImageIcon } from "lucide-react"
import { useRouter } from "next/navigation"

export default function UploadMistakePage() {
    const [image, setImage] = useState<File | null>(null)
    const [preview, setPreview] = useState<string | null>(null)
    const [ocrText, setOcrText] = useState("")
    const [loading, setLoading] = useState(false)
    const [mode, setMode] = useState<'ocr' | 'card'>('ocr') // Default to try OCR
    const fileInputRef = useRef<HTMLInputElement>(null)
    const router = useRouter()

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        // 1. Compress
        new Compressor(file, {
            quality: 0.6,
            maxWidth: 1024,
            success(result) {
                setImage(result as File)
                setPreview(URL.createObjectURL(result))
                // 2. Auto-run OCR
                runOCR(result as File)
            },
            error(err) {
                alert("压缩失败: " + err.message)
            }
        })
    }

    const runOCR = async (file: File) => {
        setLoading(true)
        setMode('ocr')
        try {
            const base64 = await toBase64(file)
            // Strip data:image/jpeg;base64, prefix
            const cleanBase64 = base64.split(',')[1]

            const res = await fetch('/api/ocr', {
                method: 'POST',
                body: JSON.stringify({ image: cleanBase64 })
            })
            const data = await res.json()

            if (data.error) throw new Error(data.error)

            setOcrText(data.text)
            if (!data.text.trim()) {
                setMode('card') // Fallback if no text found
            }
        } catch (err) {
            console.error(err)
            // Fallback to card mode silently or notify?
            setMode('card')
        } finally {
            setLoading(false)
        }
    }

    const toBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.readAsDataURL(file)
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = error => reject(error)
        })
    }

    const handleSave = async () => {
        if (!image) return
        setLoading(true)

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error("未登录")

            // 1. Upload Image to Supabase Storage
            const filename = `${user.id}/${Date.now()}.jpg`
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('mistakes') // Assumes bucket exists
                .upload(filename, image)

            if (uploadError) throw uploadError

            const { data: { publicUrl } } = supabase.storage
                .from('mistakes')
                .getPublicUrl(filename)

            // 2. Insert to Questions
            const { error: dbError } = await supabase
                .from('questions')
                .insert({
                    type: 'mistake',
                    content: mode === 'ocr' ? ocrText : '[图片错题]',
                    image_url: publicUrl,
                    tags: ['Mistake'],
                    occurrence_count: 1
                })

            if (dbError) throw dbError

            alert("保存成功！")
            router.push('/dashboard')

        } catch (err: any) {
            alert("保存失败: " + err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="max-w-md mx-auto space-y-6">
            <h2 className="text-xl font-bold text-gray-900">拍摄错题</h2>

            {/* Camera Trigger */}
            {!preview && (
                <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center bg-gray-50 active:bg-gray-100 cursor-pointer"
                >
                    <Camera className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <span className="text-gray-600 block">点击拍照 / 上传</span>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment" // Prefer rear camera on mobile
                        className="hidden"
                        onChange={handleFileChange}
                    />
                </div>
            )}

            {/* Preview & Edit */}
            {preview && (
                <div className="space-y-4">
                    <img src={preview} alt="Mistake" className="w-full rounded-lg shadow-sm max-h-64 object-contain bg-black" />

                    {loading && <div className="text-center text-blue-600">正在识别中...</div>}

                    {!loading && (
                        <>
                            <div className="flex justify-center space-x-4 text-sm">
                                <button
                                    onClick={() => setMode('ocr')}
                                    className={`px-3 py-1 rounded-full ${mode === 'ocr' ? 'bg-indigo-100 text-indigo-700 font-bold' : 'text-gray-500'}`}
                                >
                                    存为文字
                                </button>
                                <button
                                    onClick={() => setMode('card')}
                                    className={`px-3 py-1 rounded-full ${mode === 'card' ? 'bg-indigo-100 text-indigo-700 font-bold' : 'text-gray-500'}`}
                                >
                                    存为图片卡
                                </button>
                            </div>

                            {mode === 'ocr' ? (
                                <textarea
                                    value={ocrText}
                                    onChange={(e) => setOcrText(e.target.value)}
                                    className="w-full border-gray-300 rounded-md shadow-sm h-32 p-2 text-lg"
                                    placeholder="识别结果将显示在这里..."
                                />
                            ) : (
                                <div className="bg-yellow-50 p-4 rounded-md text-yellow-800 text-sm flex items-start">
                                    <ImageIcon className="w-5 h-5 mr-2 flex-shrink-0" />
                                    将以“图片卡片”形式保存。复习时直接显示原图。
                                </div>
                            )}
                        </>
                    )}

                    <div className="flex space-x-4">
                        <button
                            onClick={() => { setPreview(null); setImage(null); fileInputRef.current!.value = ''; }}
                            className="flex-1 py-3 text-gray-600 border rounded-lg bg-white active:bg-gray-50"
                        >
                            重拍
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={loading}
                            className="flex-1 py-3 bg-indigo-600 text-white rounded-lg font-bold shadow-sm active:bg-indigo-700 disabled:opacity-50 flex items-center justify-center"
                        >
                            <Save className="w-5 h-5 mr-2" />
                            保存
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
