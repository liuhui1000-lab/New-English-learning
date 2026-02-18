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

const HandwritingCanvas = forwardRef<HandwritingCanvasRef, HandwritingCanvasProps>(({
    width = "100%",
    height = 200,
    color = "#3b82f6",
    lineWidth = 3,
    className = "",
    placeholder = "请在此处手写作答...",
    onStrokeEnd
}, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasContent, setHasContent] = useState(false);

    useImperativeHandle(ref, () => ({
        clear: handleClear,
        getDataUrl: () => canvasRef.current?.toDataURL()
    }));

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set initial canvas size based on client size
        const resizeCanvas = () => {
            const parent = canvas.parentElement;
            if (parent) {
                canvas.width = parent.clientWidth;
                canvas.height = typeof height === 'number' ? height : parseInt(height);

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

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        setIsDrawing(true);
        setHasContent(true);

        const pos = getPos(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing) return;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx) return;

        const pos = getPos(e);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();

        // Prevent scrolling when drawing on touch devices
        if (e.cancelable) e.preventDefault();
    };

    const stopDrawing = () => {
        if (isDrawing) {
            setIsDrawing(false);
            if (onStrokeEnd) onStrokeEnd();
        }
    };

    const handleClear = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (ctx && canvas) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            setHasContent(false);
        }
    };

    const getPos = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();

        if ('touches' in e) {
            return {
                x: e.touches[0].clientX - rect.left,
                y: e.touches[0].clientY - rect.top
            };
        } else {
            return {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
        }
    };

    return (
        <div className={`relative w-full border-2 border-dashed border-gray-300 rounded-lg overflow-hidden bg-white/50 dark:bg-gray-800/30 ${className}`}>
            {!hasContent && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-gray-400 font-medium opacity-50">
                    {placeholder}
                </div>
            )}
            <canvas
                ref={canvasRef}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseOut={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className="w-full touch-none cursor-crosshair"
                style={{ height }}
            />

            {hasContent && (
                <button
                    onClick={handleClear}
                    className="absolute bottom-2 right-2 p-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-full text-xs transition-colors shadow-sm"
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
