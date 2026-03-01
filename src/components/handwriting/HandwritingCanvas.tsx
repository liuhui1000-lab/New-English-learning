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
// A fingertip is roughly 10x10 to 40x40 px; a palm is much larger.
const PALM_AREA_THRESHOLD = 3000;

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

    // Refs so native event listeners always get the latest values without stale closures.
    const activePointerIdRef = useRef<number | null>(null);
    const lastPosRef = useRef<{ x: number; y: number } | null>(null);
    // Wrap onStrokeEnd in a ref so native listeners always call the latest version.
    const onStrokeEndRef = useRef(onStrokeEnd);
    useEffect(() => { onStrokeEndRef.current = onStrokeEnd; }, [onStrokeEnd]);

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

    useImperativeHandle(ref, () => ({
        clear: handleClear,
        getDataUrl: () => canvasRef.current?.toDataURL()
    }));

    // ── Resize: keep canvas pixel dimensions matching its CSS layout ──
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const resizeCanvas = () => {
            const parent = canvas.parentElement;
            if (parent) {
                const targetWidth = parent.clientWidth;
                const targetHeightNum = typeof height === 'number' ? height : parseInt(height as string);

                // CRITICAL: Setting width/height ALWAYS clears the canvas.
                // Only update if dimensions actually changed to avoid clearing on every render.
                if (canvas.width !== targetWidth || canvas.height !== targetHeightNum) {
                    canvas.width = targetWidth;
                    canvas.height = targetHeightNum;

                    // Context state is lost when width/height changes, so restore it
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.strokeStyle = color;
                    ctx.lineWidth = lineWidth;
                }
            }
        };

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        return () => window.removeEventListener('resize', resizeCanvas);
    }, [height, color, lineWidth]);

    // ── All drawing logic as native listeners with { passive: false } ──
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // ── Helpers ──
        const getPos = (e: PointerEvent) => {
            const rect = canvas.getBoundingClientRect();
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        };

        const isPalmContact = (e: PointerEvent) => {
            if (e.pointerType === 'pen') return false;
            return (e.width || 1) * (e.height || 1) > PALM_AREA_THRESHOLD;
        };

        // ── Event handlers ──
        const onPointerDown = (e: PointerEvent) => {
            const area = (e.width || 1) * (e.height || 1);
            console.log(`[Handwriting] PointerDown: Type=${e.pointerType}, ID=${e.pointerId}, Area=${area}`);

            e.preventDefault();

            if (isPalmContact(e)) {
                console.warn("[Handwriting] Rejected as Palm Contact (Area:", area, ")");
                return;
            }
            if (activePointerIdRef.current !== null) return;

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            canvas.setPointerCapture(e.pointerId);
            activePointerIdRef.current = e.pointerId;

            const pos = getPos(e);
            lastPosRef.current = pos;

            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);

            setHasContent(true);
        };

        const onPointerMove = (e: PointerEvent) => {
            if (e.pointerId !== activePointerIdRef.current) return;
            e.preventDefault();

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const pos = getPos(e);
            const last = lastPosRef.current;

            if (last) {
                const midX = (last.x + pos.x) / 2;
                const midY = (last.y + pos.y) / 2;
                ctx.quadraticCurveTo(last.x, last.y, midX, midY);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(midX, midY);
            }

            lastPosRef.current = pos;
        };

        const onPointerUp = (e: PointerEvent) => {
            if (e.pointerId !== activePointerIdRef.current) return;
            e.preventDefault();

            const ctx = canvas.getContext('2d');
            if (ctx && lastPosRef.current) {
                const rect = canvas.getBoundingClientRect();
                ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
                ctx.stroke();
            }

            activePointerIdRef.current = null;
            lastPosRef.current = null;
            if (onStrokeEndRef.current) {
                // Delay to allow any final drawing cycles to complete
                setTimeout(() => onStrokeEndRef.current?.(), 0);
            }
        };

        const onPointerCancel = (e: PointerEvent) => {
            if (e.pointerId !== activePointerIdRef.current) return;
            e.preventDefault();
            console.warn("[Handwriting] Pointer Cancelled by System", e.pointerId, "Type:", e.pointerType);

            activePointerIdRef.current = null;
            lastPosRef.current = null;
            if (onStrokeEndRef.current) {
                setTimeout(() => onStrokeEndRef.current?.(), 0);
            }
        };

        const onContextMenu = (e: Event) => e.preventDefault();

        // Native Touch Prevention:
        // We MUST preventDefault on single-touch events to stop Safari's gesture layer
        // from hijacking the pointer stream and causing pointercancel.
        const onTouch = (e: TouchEvent) => {
            if (e.touches.length <= 1) {
                e.preventDefault();
            }
        };

        const opts: AddEventListenerOptions = { passive: false };
        canvas.addEventListener('pointerdown', onPointerDown, opts);
        canvas.addEventListener('pointermove', onPointerMove, opts);
        canvas.addEventListener('pointerup', onPointerUp, opts);
        canvas.addEventListener('pointercancel', onPointerCancel, opts);
        canvas.addEventListener('contextmenu', onContextMenu);
        canvas.addEventListener('touchstart', onTouch, opts);
        canvas.addEventListener('touchmove', onTouch, opts);

        return () => {
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('pointermove', onPointerMove);
            canvas.removeEventListener('pointerup', onPointerUp);
            canvas.removeEventListener('pointercancel', onPointerCancel);
            canvas.removeEventListener('contextmenu', onContextMenu);
            canvas.removeEventListener('touchstart', onTouch);
            canvas.removeEventListener('touchmove', onTouch);
        };
    }, []);

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
