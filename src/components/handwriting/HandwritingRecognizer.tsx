"use client"

import React, { useRef, useState, useImperativeHandle, forwardRef, useEffect } from 'react'
import HandwritingCanvas, { HandwritingCanvasRef } from './HandwritingCanvas'
import { Check, Loader2, RefreshCw } from 'lucide-react'

interface HandwritingRecognizerProps {
    onRecognized: (text: string) => void
    height?: number | string
    placeholder?: string
    enableAutoRecognize?: boolean
}

export interface HandwritingRecognizerRef {
    clear: () => void
    recognize: () => Promise<string | null>
    getDataUrl: () => string | null
}

const HandwritingRecognizer = forwardRef<HandwritingRecognizerRef, HandwritingRecognizerProps>(({ onRecognized, height = 150, placeholder, enableAutoRecognize = false }, ref) => {
    const canvasRef = useRef<HandwritingCanvasRef>(null)
    const [recognizing, setRecognizing] = useState(false)
    const [lastRecognized, setLastRecognized] = useState<string | null>(null)
    const isDirty = useRef(false)
    const strokeVersion = useRef(0)
    const lastRecognizedRef = useRef<string | null>(null)
    const [isAutoRecognizing, setIsAutoRecognizing] = useState(false)

    // Sync state to ref
    useEffect(() => { lastRecognizedRef.current = lastRecognized }, [lastRecognized])

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

    // Auto-recognition state
    const debounceTimer = useRef<NodeJS.Timeout | null>(null)

    const handleStrokeEnd = () => {
        isDirty.current = true
        strokeVersion.current += 1

        // Clear existing timer
        if (debounceTimer.current) clearTimeout(debounceTimer.current)

        // Only start auto-recognition if enabled
        if (enableAutoRecognize) {
            // Set new timer (1.5s debounce)
            debounceTimer.current = setTimeout(() => {
                performRecognition(true)
            }, 1500)
        }
    }

    const performRecognition = async (isAuto = false): Promise<string | null> => {
        const currentVersion = strokeVersion.current
        const dataUrl = canvasRef.current?.getDataUrl()

        // Check for empty or too short content (blank canvas)
        if (!dataUrl || dataUrl.length < 1000) {
            return ""
        }

        if (isAuto) setIsAutoRecognizing(true)
        else setRecognizing(true)

        // Don't clear lastRecognized immediately on auto to avoid flickering
        if (!isAuto) setLastRecognized(null)

        let resultText = ""

        try {
            // Compress Image
            console.log(isAuto ? `Auto-Recognizing (v${currentVersion})...` : `Recognizing (v${currentVersion})...`, "Original size:", dataUrl.length)
            const compressedDataUrl = await compressImage(dataUrl)
            console.log("Compressed size:", compressedDataUrl.length)

            // 1. Try Server-side OCR (Paddle/Active Provider)
            const base64Image = compressedDataUrl.replace(/^data:image\/\w+;base64,/, "");
            const res = await fetch('/api/ocr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64Image })
            })

            if (!res.ok) {
                const errorText = await res.text();
                // If 429 in auto mode, just warn and stop silently
                if (res.status === 429 && isAuto) {
                    console.warn("Auto-OCR rate limited, skipping.")
                    return null
                }
                throw new Error(`Server OCR failed: ${res.status} ${errorText}`);
            }

            const data = await res.json()
            if (data.text) {
                resultText = data.text
            }

        } catch (serverError) {
            console.error("Server-side OCR failed", serverError)
            return null
        } finally {
            if (isAuto) setIsAutoRecognizing(false)
            else setRecognizing(false)
        }

        if (resultText) {
            // Only update cache/clean state if version matches (no new strokes happened)
            if (strokeVersion.current === currentVersion) {
                setLastRecognized(resultText)
                isDirty.current = false // Mark as clean
                onRecognized(resultText)
            } else {
                console.log(`Recognition (v${currentVersion}) finished but new strokes detected (v${strokeVersion.current}). Marking as outdated.`)
                // We still update the UI with what we got, but we don't mark as clean, 
                // so subsequent submit will force re-recognition.
                setLastRecognized(resultText)
                onRecognized(resultText)
            }
            return resultText
        }
        return null
    }

    useImperativeHandle(ref, () => ({
        clear: () => {
            canvasRef.current?.clear()
            setLastRecognized(null)
            isDirty.current = false
        },
        recognize: async () => {
            // Optimization: If not dirty and has result, return cached
            if (!isDirty.current && lastRecognizedRef.current) {
                console.log("Returning cached OCR result")
                return lastRecognizedRef.current
            }
            return await performRecognition()
        },
        getDataUrl: () => {
            return canvasRef.current?.getDataUrl() || null
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
                onStrokeEnd={handleStrokeEnd}
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

            {/* Auto-Saving Indicator */}
            {isAutoRecognizing && (
                <div className="absolute top-2 right-2 bg-indigo-50 text-indigo-600 text-xs px-2 py-1 rounded-full animate-pulse flex items-center">
                    <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> 自动识别中...
                </div>
            )}

            {lastRecognized && !recognizing && !isAutoRecognizing && (
                <div className="absolute top-2 right-2 bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full animate-in fade-in slide-in-from-bottom-2 flex items-center">
                    <Check className="w-3 h-3 mr-1" /> 已填入: {lastRecognized}
                </div>
            )}
        </div>
    )
})

HandwritingRecognizer.displayName = "HandwritingRecognizer"

export default HandwritingRecognizer
