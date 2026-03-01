"use client"

import React, { useRef, useState, useImperativeHandle, forwardRef, useEffect } from 'react'
import HandwritingCanvas, { HandwritingCanvasRef } from './HandwritingCanvas'
import { Check, Loader2, RefreshCw } from 'lucide-react'

interface HandwritingRecognizerProps {
    onRecognized: (text: string) => void
    height?: number | string
    placeholder?: string
    enableAutoRecognize?: boolean
    onRecognizingChange?: (isRecognizing: boolean) => void
}

export interface HandwritingRecognizerRef {
    clear: () => void
    recognize: () => Promise<string | null>
    getDataUrl: () => string | null
}

const HandwritingRecognizer = forwardRef<HandwritingRecognizerRef, HandwritingRecognizerProps>(({ onRecognized, height = 150, placeholder, enableAutoRecognize = false, onRecognizingChange }, ref) => {
    const canvasRef = useRef<HandwritingCanvasRef>(null)
    const [recognizing, setRecognizing] = useState(false)
    const [lastRecognized, setLastRecognized] = useState<string | null>(null)
    const isDirty = useRef(false)
    const strokeVersion = useRef(0)
    const lastRecognizedRef = useRef<string | null>(null)
    const [isAutoRecognizing, setIsAutoRecognizing] = useState(false)

    // Sync state to ref
    useEffect(() => { lastRecognizedRef.current = lastRecognized }, [lastRecognized])

    // Sync auto recognizing state to parent
    useEffect(() => {
        if (onRecognizingChange) {
            onRecognizingChange(isAutoRecognizing)
        }
    }, [isAutoRecognizing, onRecognizingChange])

    // Helper to compress image (with Auto-Crop)
    const compressImage = (dataUrl: string, maxWidth = 1000, quality = 0.95): Promise<string | null> => {
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

                // Draw TO temp canvas (Keep transparency for dilation)
                tempCtx.drawImage(img, 0, 0)

                // 2. Scan for bounding box ONLY (No more binarization)
                // PaddleOCR relies on natural anti-aliased grey edges to identify letters.
                // Forcing everything to pure black created pixelated jagged edges that broke detection for simple letters like 'C'
                const imageData = tempCtx.getImageData(0, 0, img.width, img.height)
                const data = imageData.data
                let minX = img.width, minY = img.height, maxX = 0, maxY = 0
                let foundAny = false

                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i]
                    const g = data[i + 1]
                    const b = data[i + 2]
                    const a = data[i + 3]

                    // Detect ink by checking if pixel is not fully white/transparent
                    if (a > 10 && (r < 250 || g < 250 || b < 250)) {
                        const x = (i / 4) % img.width
                        const y = Math.floor((i / 4) / img.width)

                        if (!foundAny) {
                            minX = x; minY = y; maxX = x; maxY = y;
                            foundAny = true
                        } else {
                            minX = Math.min(minX, x)
                            minY = Math.min(minY, y)
                            maxX = Math.max(maxX, x)
                            maxY = Math.max(maxY, y)
                        }
                    }
                }

                if (!foundAny) {
                    console.warn("Auto-Crop finding NO content (Blank Canvas)");
                    resolve(null); // Return null to signal empty content
                    return;
                }

                // 3. Determine Cutout
                let cutX = 0, cutY = 0, cutW = img.width, cutH = img.height

                if (foundAny) {
                    const cutPadding = 10
                    cutX = Math.max(0, minX - cutPadding)
                    cutY = Math.max(0, minY - cutPadding)
                    cutW = Math.min(img.width, maxX + cutPadding) - cutX
                    cutH = Math.min(img.height, maxY + cutPadding) - cutY
                } else {
                    cutW = 0; cutH = 0;
                }

                // 4. Create Final Canvas (Fit to content)
                const padding = 50 // Increased padding for context
                const maxSide = 960 // Backend limit as seen in logs
                const targetHeight = 500 // Increased to 500px for maximum detail

                let scale = 1
                if (cutH > 0) {
                    scale = targetHeight / cutH
                    // Max 5x upscale
                    scale = Math.min(scale, 5)
                }

                // Width Guard: ensure we don't exceed 960px after scaling+padding
                if (cutW * scale + padding * 2 > maxSide) {
                    scale = (maxSide - padding * 2) / cutW
                }

                const finalW = cutW * scale
                const finalH = cutH * scale

                const canvasW = finalW + (padding * 2)
                const canvasH = finalH + (padding * 2)

                const canvas = document.createElement('canvas')
                canvas.width = canvasW
                canvas.height = canvasH
                const ctx = canvas.getContext('2d')

                if (!ctx) { reject(new Error("Failed")); return; }

                // Fill White Background
                ctx.fillStyle = '#FFFFFF'
                ctx.fillRect(0, 0, canvasW, canvasH)

                // Draw the CUTOUT centered
                if (cutW > 0 && cutH > 0) {
                    const destX = padding
                    const destY = padding

                    // 5. DRAW WITH SHARP DILATION (Thickening)
                    // Use a 5-point cross for sharper edges
                    const offsets = [
                        [0, 0],   // Center
                        [1, 0], [0, 1], [-1, 0], [0, -1]
                    ];

                    offsets.forEach(([ox, oy]) => {
                        ctx.drawImage(
                            tempCanvas,
                            cutX, cutY, cutW, cutH, // Source rect
                            destX + ox, destY + oy, finalW, finalH // Dest rect
                        )
                    });
                }
                // 6. Draw the original smooth strokes (removing putImageData binarization override)

                // Revert to JPEG (High Quality) as PNG was rejected for size
                const base64 = canvas.toDataURL('image/jpeg', 0.95)

                console.log(`Recognizing (v${strokeVersion.current})... Original size: ${dataUrl.length}`)

                resolve(base64)
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

            if (!compressedDataUrl) {
                console.log("Canvas is blank (auto-crop found nothing). Skipping OCR.");
                return "";
            }

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

            // Log Server Debug Info
            if (data.debug) {
                console.log("Server Debug Info (Full):", JSON.stringify(data.debug, null, 2));

                // Also log warnings if empty
                if (!data.text) {
                    console.warn("Server returned empty text but success status.");
                }
            }

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

    // Same no-select style as HandwritingCanvas — prevent pen hover from triggering
    // text selection or iOS callout on the button overlay area.
    const noSelectStyle: React.CSSProperties = {
        userSelect: 'none',
        WebkitUserSelect: 'none',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        WebkitTouchCallout: 'none' as any,
    }

    return (
        <div className="relative group" style={noSelectStyle}>
            <HandwritingCanvas
                ref={canvasRef}
                height={height}
                placeholder={placeholder}
                className={recognizing ? "opacity-50 pointer-events-none" : ""}
                onStrokeEnd={handleStrokeEnd}
            />

            <div className="absolute top-2 right-12 flex space-x-2" style={noSelectStyle}>
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
                <div className="absolute top-2 left-2 bg-indigo-50 text-indigo-600 text-xs px-2 py-1 rounded-full animate-pulse flex items-center">
                    <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> 自动识别中...
                </div>
            )}

            {lastRecognized && !recognizing && !isAutoRecognizing && (
                <div className="absolute top-2 left-2 bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full animate-in fade-in slide-in-from-bottom-2 flex items-center">
                    <Check className="w-3 h-3 mr-1" /> 已填入: {lastRecognized}
                </div>
            )}
        </div>
    )
})

HandwritingRecognizer.displayName = "HandwritingRecognizer"

export default HandwritingRecognizer
