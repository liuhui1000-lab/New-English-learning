"use client"

import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';

interface HandwritingCanvasProps {
    width?: number | string;
    height?: number | string;
    color?: string;
    lineWidth?: number;
    className?: string;
    placeholder?: string;
    onStrokeEnd?: () => void;
}

export interface HandwritingCanvasRef {
    clear: () => void;
    getDataUrl: () => string | undefined;
}

// Palm rejection: reject touches where contact area exceeds this threshold (px²)
// A fingertip is roughly 10x10 to 20x20 px on most screens; a palm is much larger.
const PALM_AREA_THRESHOLD = 800; // width * height > 800 = likely palm, reject

const HandwritingCanvas = forwardRef<HandwritingCanvasRef, HandwritingCanvasProps>(({
    width = "100%",
    height = 200,
    color = "#000000",
    lineWidth = 4,
    className = "",
    placeholder = "请在此处手写作答...",
    onStrokeEnd
}, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [hasContent, setHasContent] = useState(false);

    // Track the active pointerId so only one pointer draws at a time
    const activePointerIdRef = useRef<number | null>(null);
    // Store last position for bezier midpoint smoothing
    const lastPosRef = useRef<{ x: number; y: number } | null>(null);

    useImperativeHandle(ref, () => ({
        clear: handleClear,
        getDataUrl: () => canvasRef.current?.toDataURL()
    }));

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const resizeCanvas = () => {
            const parent = canvas.parentElement;
            if (parent) {
                canvas.width = parent.clientWidth;
                canvas.height = typeof height === 'number' ? height : parseInt(height as string);

                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.strokeStyle = color;
                ctx.lineWidth = lineWidth;
            }
        };

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        return () => window.removeEventListener('resize', resizeCanvas);
    }, [height, color, lineWidth]);

    // --- Pointer Events (replaces Touch + Mouse events) ---

    const getCanvasPos = (e: React.PointerEvent): { x: number; y: number } => {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };
    };

    const isPalmContact = (e: React.PointerEvent): boolean => {
        // width and height are the contact dimensions reported by the hardware.
        // Pen tip or fingertip area is small; palm is much larger.
        // Only apply to touch type; pen type naturally has small contact.
        if (e.pointerType === 'pen') return false;
        const area = (e.width || 1) * (e.height || 1);
        return area > PALM_AREA_THRESHOLD;
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        // CRITICAL: Prevent default immediately to stop Safari/iPadOS from treating
        // pen touch-down as the start of a text-selection drag gesture.
        // Without this, pointerdown initiates selection that picks up the next question's
        // number text as the pen moves — even though pointermove also has preventDefault(),
        // that fires too late to cancel the already-started selection.
        e.preventDefault();

        // Reject palm contacts
        if (isPalmContact(e)) return;

        // Only one pointer at a time - reject subsequent pointers
        if (activePointerIdRef.current !== null) return;

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas) return;

        // Capture this pointer so it stays tracked even if it leaves the element
        canvas.setPointerCapture(e.pointerId);
        activePointerIdRef.current = e.pointerId;

        const pos = getCanvasPos(e);
        lastPosRef.current = pos;

        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);

        setHasContent(true);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        // CRITICAL: Always preventDefault on pointermove, even during hover (buttons=0).
        // Without this, iPadOS Safari + Apple Pencil hover generates a drag-select gesture
        // that can trigger "select all" on surrounding text. Same issue on Android Chrome.
        e.preventDefault();

        // Only draw when this is the active pointer
        if (e.pointerId !== activePointerIdRef.current) return;
        if (isPalmContact(e)) return;

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx) return;

        const pos = getCanvasPos(e);
        const last = lastPosRef.current;

        if (last) {
            // Bezier midpoint smoothing: draw a quadratic curve through the midpoint
            // This smooths out jitter while keeping strokes looking natural.
            const midX = (last.x + pos.x) / 2;
            const midY = (last.y + pos.y) / 2;
            ctx.quadraticCurveTo(last.x, last.y, midX, midY);
            ctx.stroke();

            // Start a new sub-path from the midpoint to avoid accumulation artifacts
            ctx.beginPath();
            ctx.moveTo(midX, midY);
        }

        lastPosRef.current = pos;
    };

    // Suppress hover-entry gestures (Apple Pencil / Windows Ink entering the digitizer range)
    const handlePointerOver = (e: React.PointerEvent) => e.preventDefault();

    // Suppress context menu from pen barrel button or long-press hover (all platforms)
    const handleContextMenu = (e: React.MouseEvent) => e.preventDefault();

    const handlePointerUp = (e: React.PointerEvent) => {
        if (e.pointerId !== activePointerIdRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (ctx && lastPosRef.current) {
            // Draw final segment to the exact release point
            ctx.lineTo(e.clientX - canvas!.getBoundingClientRect().left, e.clientY - canvas!.getBoundingClientRect().top);
            ctx.stroke();
        }

        activePointerIdRef.current = null;
        lastPosRef.current = null;

        if (onStrokeEnd) onStrokeEnd();
    };

    const handlePointerCancel = (e: React.PointerEvent) => {
        if (e.pointerId !== activePointerIdRef.current) return;
        activePointerIdRef.current = null;
        lastPosRef.current = null;
        if (onStrokeEnd) onStrokeEnd();
    };

    const handleClear = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (ctx && canvas) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            setHasContent(false);
            activePointerIdRef.current = null;
            lastPosRef.current = null;
        }
    };

    // Inline style constants to prevent selection on all platforms:
    // - userSelect / WebkitUserSelect: block text drag-selection (all browsers)
    // - WebkitTouchCallout: blocks the iOS "Copy / Select All" callout on long-press
    //   (cannot be done via Tailwind; must be inline or global CSS)
    const noSelectStyle: React.CSSProperties = {
        userSelect: 'none',
        WebkitUserSelect: 'none',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        WebkitTouchCallout: 'none' as any,
    };

    return (
        <div
            className={`relative w-full border-2 border-dashed border-gray-300 rounded-lg overflow-hidden bg-white/50 dark:bg-gray-800/30 ${className}`}
            style={noSelectStyle}
        >
            {!hasContent && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-gray-400 font-medium opacity-50">
                    {placeholder}
                </div>
            )}
            <canvas
                ref={canvasRef}
                // Pointer Events (handles pen, touch, mouse uniformly)
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                onPointerOver={handlePointerOver}
                onPointerEnter={handlePointerOver}
                // Prevent context menu: pen barrel button / long-press hover on all platforms
                onContextMenu={handleContextMenu}
                // touch-none: prevent browser scroll/zoom gestures inside the canvas
                // All scroll must happen outside the canvas area (per user design decision)
                className="w-full touch-none cursor-crosshair"
                style={{ height, ...noSelectStyle }}
            />

            {hasContent && (
                <button
                    onClick={handleClear}
                    className="absolute top-2 right-2 p-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-full text-xs transition-colors shadow-sm"
                    title="清除手写"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-600 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </button>
            )}
        </div>
    );
});

HandwritingCanvas.displayName = 'HandwritingCanvas';

export default HandwritingCanvas;
