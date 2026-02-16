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
        setLastRecognized(null) // Clear previous result
        let resultText = ""

        try {
            // 1. Try Tesseract.js (Client-side)
            console.log("Attempting Client-side OCR (Tesseract.js)...")

            // Dynamic import/load check
            if (!(window as any).Tesseract) {
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script')
                    script.src = 'https://unpkg.com/tesseract.js@5.1.0/dist/tesseract.min.js'
                    script.onload = resolve
                    script.onerror = reject
                    document.head.appendChild(script)
                })
            }

            const Tesseract = (window as any).Tesseract
            const { data: { text } } = await Tesseract.recognize(dataUrl, 'eng', {
                logger: (m: any) => console.log(m)
            })

            const cleanText = text.trim()
            if (cleanText && cleanText.length > 0) {
                console.log("Tesseract Success:", cleanText)
                resultText = cleanText
            } else {
                throw new Error("Tesseract returned empty text")
            }

        } catch (clientError) {
            console.warn("Client-side OCR failed or empty, falling back to AI:", clientError)

            // 2. Fallback to Server-side AI
            try {
                const res = await fetch('/api/ai/recognize-handwriting', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image: dataUrl })
                })

                if (!res.ok) throw new Error(await res.text())

                const data = await res.json()
                if (data.text) {
                    resultText = data.text
                }
            } catch (serverError: any) {
                console.error("Server-side OCR also failed:", serverError)
                alert(`识别失败 (OCR & AI): ${serverError.message}`)
                return // Stop here
            }
        } finally {
            setRecognizing(false)
        }

        if (resultText) {
            setLastRecognized(resultText)
            onRecognized(resultText)
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
