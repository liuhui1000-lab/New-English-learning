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

    // Helper to compress image (with Auto-Crop)
    const compressImage = (dataUrl: string, maxWidth = 1000, quality = 0.95): Promise<string> => {
        return new Promise((resolve, reject) => {
            const img = new Image()
            img.src = dataUrl
            img.onload = () => {
                // 1. Create temp canvas to read pixels
                const tempCanvas = document.createElement('canvas')
                tempCanvas.width = img.width
                tempCanvas.height = img.height
                const tempCtx = tempCanvas.getContext('2d')
                if (!tempCtx) {
                    reject(new Error("Failed to get temp canvas context"))
                    return
                }

                // Fill white first (handle transparency)
                tempCtx.fillStyle = '#FFFFFF'
                tempCtx.fillRect(0, 0, img.width, img.height)
                tempCtx.drawImage(img, 0, 0)

                // 2. Scan for bounding box (Auto-Crop) & Contrast Boost
                const imageData = tempCtx.getImageData(0, 0, img.width, img.height)
                const data = imageData.data
                let minX = img.width, minY = img.height, maxX = 0, maxY = 0
                let foundAny = false

                // Process Pixels: Contrast Boost + Bounding Box Scan
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i]
                    const g = data[i + 1]
                    const b = data[i + 2]

                    // Simple Binarization / Thresholding
                    // If it's not 'white enough', treat it as ink.
                    // Threshold 230 allows for some anti-aliasing but cuts out paper noise/compression artifacts.
                    if (r < 230 || g < 230 || b < 230) {
                        // Make it PURE BLACK for maximum contrast
                        data[i] = 0
                        data[i + 1] = 0
                        data[i + 2] = 0

                        // Update bounding box based on index
                        const pixelIndex = i / 4
                        const x = pixelIndex % img.width
                        const y = Math.floor(pixelIndex / img.width)

                        if (x < minX) minX = x
                        if (x > maxX) maxX = x
                        if (y < minY) minY = y
                        if (y > maxY) maxY = y
                        foundAny = true
                    } else {
                        // Make it PURE WHITE to clean background
                        data[i] = 255
                        data[i + 1] = 255
                        data[i + 2] = 255
                    }
                }

                // Put the High-Contrast data back to temp canvas so we draw the CLEARED version
                tempCtx.putImageData(imageData, 0, 0)

                // 3. Determine Cutout
                // DEBUG LOGGING
                console.log(`Auto-Crop Scan: foundAny=${foundAny}, Bounds: [${minX}, ${minY}, ${maxX}, ${maxY}]`);

                let cutX = 0, cutY = 0, cutW = img.width, cutH = img.height

                if (foundAny) {
                    const cutPadding = 10
                    cutX = Math.max(0, minX - cutPadding)
                    cutY = Math.max(0, minY - cutPadding)
                    cutW = Math.min(img.width, maxX + cutPadding) - cutX
                    cutH = Math.min(img.height, maxY + cutPadding) - cutY
                    console.log(`Auto-Crop Calculated: x=${cutX}, y=${cutY}, w=${cutW}, h=${cutH}`);
                } else {
                    cutW = 0; cutH = 0;
                    console.warn("Auto-Crop finding NO content (Blank Canvas)");
                }

                // 4. Create Final Canvas (Min Dimension 300)
                const minDimension = 300
                const padding = 40 // MORE PADDING (was 20) to give OCR context

                const availW = minDimension - (padding * 2)
                const availH = minDimension - (padding * 2)

                let scale = 1
                if (cutW > 0 && cutH > 0) {
                    const scaleX = availW / cutW
                    const scaleY = availH / cutH
                    scale = Math.min(scaleX, scaleY)
                }

                const canvasW = minDimension
                const canvasH = minDimension

                const canvas = document.createElement('canvas')
                canvas.width = canvasW
                canvas.height = canvasH
                const ctx = canvas.getContext('2d')

                if (!ctx) { reject(new Error("Failed")); return; }

                ctx.fillStyle = '#FFFFFF'
                ctx.fillRect(0, 0, canvasW, canvasH)

                // Draw the CUTOUT centered and Scaled
                if (cutW > 0 && cutH > 0) {
                    const finalW = cutW * scale
                    const finalH = cutH * scale
                    const destX = (canvasW - finalW) / 2
                    const destY = (canvasH - finalH) / 2

                    // Re-enable Smoothing: Jagged nearest-neighbor edges might confuse OCR
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';

                    // Draw from TEMP CANVAS (which now has high-contrast pixels)
                    ctx.drawImage(
                        tempCanvas,
                        cutX, cutY, cutW, cutH, // Source rect
                        destX, destY, finalW, finalH // Dest rect
                    )
                }

                resolve(canvas.toDataURL('image/jpeg', quality))
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
