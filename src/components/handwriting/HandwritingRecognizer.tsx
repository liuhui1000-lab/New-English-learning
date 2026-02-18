"use client"

import React, { useRef, useState, useImperativeHandle, forwardRef } from 'react'
import HandwritingCanvas, { HandwritingCanvasRef } from './HandwritingCanvas'
import { Check, Loader2, RefreshCw } from 'lucide-react'

interface HandwritingRecognizerProps {
    onRecognized: (text: string) => void
    height?: number | string
    placeholder?: string
}

export interface HandwritingRecognizerRef {
    clear: () => void
    recognize: () => Promise<string | null>
}

const HandwritingRecognizer = forwardRef<HandwritingRecognizerRef, HandwritingRecognizerProps>(({ onRecognized, height = 150, placeholder }, ref) => {
    const canvasRef = useRef<HandwritingCanvasRef>(null)
    const [recognizing, setRecognizing] = useState(false)
    const [lastRecognized, setLastRecognized] = useState<string | null>(null)

    // Helper to compress image
    const compressImage = (dataUrl: string, maxWidth = 1000, quality = 0.6): Promise<string> => {
        return new Promise((resolve, reject) => {
            const img = new Image()
            img.src = dataUrl
            img.onload = () => {
                const canvas = document.createElement('canvas')
                let width = img.width
                let height = img.height

                // Resize logic
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width)
                    width = maxWidth
                }

                canvas.width = width
                canvas.height = height
                const ctx = canvas.getContext('2d')
                if (!ctx) {
                    reject(new Error("Failed to get compression canvas context"))
                    return
                }

                // Fill white background (handling transparency)
                ctx.fillStyle = '#FFFFFF'
                ctx.fillRect(0, 0, width, height)

                // Draw image
                ctx.drawImage(img, 0, 0, width, height)

                // Export to JPEG
                const compressedDataUrl = canvas.toDataURL('image/jpeg', quality)
                resolve(compressedDataUrl)
            }
            img.onerror = (e) => reject(e)
        })
    }

    const performRecognition = async (): Promise<string | null> => {
        const dataUrl = canvasRef.current?.getDataUrl()

        // Check for empty or too short content (blank canvas)
        if (!dataUrl || dataUrl.length < 1000) {
            // Return empty string to explicitly clear the answer
            return ""
        }

        setRecognizing(true)
        setLastRecognized(null)
        let resultText = ""

        try {
            // Compress Image
            // console.log("Original size:", dataUrl.length)
            const compressedDataUrl = await compressImage(dataUrl)
            // console.log("Compressed size:", compressedDataUrl.length)

            // 1. Try Server-side OCR (Paddle/Active Provider)
            // console.log("Attempting Server-side OCR...")

            const base64Image = compressedDataUrl.replace(/^data:image\/\w+;base64,/, "");
            const res = await fetch('/api/ocr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64Image })
            })

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`Server OCR failed: ${res.status} ${errorText}`);
            }

            const data = await res.json()
            if (data.text) {
                resultText = data.text
            }

        } catch (serverError) {
            console.warn("Server-side OCR failed, falling back to Tesseract...", serverError)

            // 2. Fallback to Client-side Tesseract.js (Use original higher quality image for local processing if needed, or compressed)
            // Tesseract might actually benefit from clearer images, but let's try compressed first to save memory? 
            // Actually for local Tesseract, network isn't an issue, so we can use original dataUrl for better accuracy.
            try {
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
                const { data: { text } } = await Tesseract.recognize(dataUrl, 'eng', { // Use original dataUrl for local
                    // logger: (m: any) => console.log(m)
                })

                const cleanText = text.trim()
                if (cleanText && cleanText.length > 0) {
                    console.log("Tesseract Success:", cleanText)
                    resultText = cleanText
                }
            } catch (clientError: any) {
                console.error("Both OCR methods failed", clientError)
                return null
            }
        } finally {
            setRecognizing(false)
        }

        if (resultText) {
            setLastRecognized(resultText)
            onRecognized(resultText)
            return resultText
        }
        return null
    }

    useImperativeHandle(ref, () => ({
        clear: () => {
            canvasRef.current?.clear()
            setLastRecognized(null)
        },
        recognize: async () => {
            return await performRecognition()
        }
    }))

    const handleRecognizeClick = async () => {
        await performRecognition()
    }

    return (
        <div className="relative group">
            <HandwritingCanvas
                ref={canvasRef}
                height={height}
                placeholder={placeholder}
                className={recognizing ? "opacity-50 pointer-events-none" : ""}
            />

            <div className="absolute bottom-2 right-12 flex space-x-2">
                <button
                    onClick={handleRecognizeClick}
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

            {lastRecognized && !recognizing && (
                <div className="absolute top-2 right-2 bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full animate-in fade-in slide-in-from-bottom-2 flex items-center">
                    <Check className="w-3 h-3 mr-1" /> 已填入: {lastRecognized}
                </div>
            )}
        </div>
    )
})

HandwritingRecognizer.displayName = "HandwritingRecognizer"

export default HandwritingRecognizer
