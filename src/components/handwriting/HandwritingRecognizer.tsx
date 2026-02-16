"use client"

import React, { useRef, useState } from 'react'
import HandwritingCanvas, { HandwritingCanvasRef } from './HandwritingCanvas'
import { Check, Loader2, RefreshCw } from 'lucide-react'

interface HandwritingRecognizerProps {
    onRecognized: (text: string) => void
    height?: number | string
    placeholder?: string
}

export default function HandwritingRecognizer({ onRecognized, height = 150, placeholder }: HandwritingRecognizerProps) {
    const canvasRef = useRef<HandwritingCanvasRef>(null)
    const [recognizing, setRecognizing] = useState(false)
    const [lastRecognized, setLastRecognized] = useState<string | null>(null)

    const handleRecognize = async () => {
        const dataUrl = canvasRef.current?.getDataUrl()
        if (!dataUrl) return

        setRecognizing(true)
        try {
            const res = await fetch('/api/ai/recognize-handwriting', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: dataUrl })
            })

            if (!res.ok) throw new Error(await res.text())

            const data = await res.json()
            if (data.text) {
                setLastRecognized(data.text)
                onRecognized(data.text)
            }
        } catch (e: any) {
            console.error("Recognition failed:", e)
            alert(`识别失败: ${e.message}`)
        } finally {
            setRecognizing(false)
        }
    }

    const handleClear = () => {
        canvasRef.current?.clear()
        setLastRecognized(null)
    }

    return (
        <div className="relative group">
            <HandwritingCanvas
                ref={canvasRef}
                height={height}
                placeholder={placeholder}
                className={recognizing ? "opacity-50 pointer-events-none" : ""}
            />

            {/* Controls Overlay - Always visible or on hover? Let's make it always visible for mobile ease */}
            <div className="absolute bottom-2 right-12 flex space-x-2">
                <button
                    onClick={handleRecognize}
                    disabled={recognizing}
                    className="bg-indigo-600 text-white p-2 rounded-full shadow-lg hover:bg-indigo-700 transition disabled:opacity-50 flex items-center justify-center"
                    title="识别文字并填入"
                >
                    {recognizing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <span className="text-xs font-bold px-1">识别</span>
                    )}
                </button>
            </div>

            {/* Feedback Toast */}
            {lastRecognized && !recognizing && (
                <div className="absolute top-2 right-2 bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full animate-in fade-in slide-in-from-bottom-2 flex items-center">
                    <Check className="w-3 h-3 mr-1" /> 已填入: {lastRecognized}
                </div>
            )}
        </div>
    )
}
