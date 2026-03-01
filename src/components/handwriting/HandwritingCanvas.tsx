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
const PALM_AREA_THRESHOLD = 800;

// Active Pen Mode cooldown: keep body user-select:none for this long after pen lifts,
// covering student writing pauses so palm contact can't select surrounding text.
const PEN_MODE_COOLDOWN_MS = 1200;

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
    const penModeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

    // ── Cleanup body styles on unmount ──
    useEffect(() => {
        return () => {
            if (penModeTimerRef.current) clearTimeout(penModeTimerRef.current);
            document.body.style.userSelect = '';
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (document.body.style as any).WebkitUserSelect = '';
        };
    }, []);

    // ── All drawing logic as native listeners with { passive: false } ──
    //
    // WHY NATIVE LISTENERS:
    // React registers event handlers via delegation at the root container.
    // The event must bubble all the way up before React calls our handler —
    // by that time the browser has already decided whether to start a gesture
    // and may have fired `pointercancel`, clearing activePointerIdRef before
    // any stroke can be drawn. Native listeners on the element fire FIRST,
    // synchronously, giving us a guaranteed chance to preventDefault before
    // the browser's gesture recognizer runs.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // ── Active Pen Mode helpers (defined inside effect: stable, no stale closures) ──
        const activatePenMode = () => {
            if (penModeTimerRef.current) {
                clearTimeout(penModeTimerRef.current);
                penModeTimerRef.current = null;
            }
            document.body.style.userSelect = 'none';
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (document.body.style as any).WebkitUserSelect = 'none';
        };

        const schedulePenModeDeactivation = () => {
            if (penModeTimerRef.current) clearTimeout(penModeTimerRef.current);
            penModeTimerRef.current = setTimeout(() => {
                document.body.style.userSelect = '';
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (document.body.style as any).WebkitUserSelect = '';
                penModeTimerRef.current = null;
            }, PEN_MODE_COOLDOWN_MS);
        };

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
            e.preventDefault();
            activatePenMode();

            if (isPalmContact(e)) return;
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
            e.preventDefault();

            if (e.pointerId !== activePointerIdRef.current) return;
            if (isPalmContact(e)) return;

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const pos = getPos(e);
            const last = lastPosRef.current;

            if (last) {
                // Bezier midpoint smoothing for natural-looking strokes
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
            e.preventDefault();
            if (e.pointerId !== activePointerIdRef.current) return;

            const ctx = canvas.getContext('2d');
            if (ctx && lastPosRef.current) {
                const rect = canvas.getBoundingClientRect();
                ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
                ctx.stroke();
            }

            activePointerIdRef.current = null;
            lastPosRef.current = null;
            schedulePenModeDeactivation();
            onStrokeEndRef.current?.();
        };

        const onPointerCancel = (e: PointerEvent) => {
            e.preventDefault();
            if (e.pointerId !== activePointerIdRef.current) return;
            activePointerIdRef.current = null;
            lastPosRef.current = null;
            schedulePenModeDeactivation();
            onStrokeEndRef.current?.();
        };

        const onContextMenu = (e: Event) => e.preventDefault();

        // ── Register all listeners with passive: false ──
        const opts: AddEventListenerOptions = { passive: false };
        canvas.addEventListener('pointerdown', onPointerDown, opts);
        canvas.addEventListener('pointermove', onPointerMove, opts);
        canvas.addEventListener('pointerup', onPointerUp, opts);
        canvas.addEventListener('pointercancel', onPointerCancel, opts);
        canvas.addEventListener('contextmenu', onContextMenu);

        return () => {
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('pointermove', onPointerMove);
            canvas.removeEventListener('pointerup', onPointerUp);
            canvas.removeEventListener('pointercancel', onPointerCancel);
            canvas.removeEventListener('contextmenu', onContextMenu);
        };
    }, []); // Runs once on mount — all mutable state accessed via refs

    // Inline styles: prevent text selection and iOS callout on the canvas wrapper and canvas itself.
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
                // No React pointer event handlers — all drawing handled by native listeners above.
                // touch-none: CSS hint to browser not to handle touch gestures on this element.
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
