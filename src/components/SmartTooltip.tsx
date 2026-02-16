
import React, { useState, useRef, useEffect } from 'react'

interface SmartTooltipProps {
    children: React.ReactNode
    content: React.ReactNode
    className?: string
}

export default function SmartTooltip({ children, content, className = "" }: SmartTooltipProps) {
    const [isVisible, setIsVisible] = useState(false)
    const [position, setPosition] = useState<'top' | 'bottom'>('top')
    const [horizontalAlign, setHorizontalAlign] = useState<'center' | 'left' | 'right'>('center')

    const triggerRef = useRef<HTMLDivElement>(null)
    const tooltipRef = useRef<HTMLDivElement>(null)

    const calculatePosition = () => {
        if (!triggerRef.current || !tooltipRef.current) return

        const triggerRect = triggerRef.current.getBoundingClientRect()
        const tooltipRect = tooltipRef.current.getBoundingClientRect()
        const viewportHeight = window.innerHeight
        const viewportWidth = window.innerWidth

        // 1. Check Vertical Space
        const spaceAbove = triggerRect.top
        const spaceBelow = viewportHeight - triggerRect.bottom
        const tooltipHeight = tooltipRect.height + 10 // +10 for buffer/arrow

        // Prefer top, but flip if not enough space
        if (spaceAbove < tooltipHeight && spaceBelow > tooltipHeight) {
            setPosition('bottom')
        } else {
            setPosition('top')
        }

        // 2. Check Horizontal Space
        const tooltipWidth = tooltipRect.width
        const triggerCenter = triggerRect.left + triggerRect.width / 2

        // Default center alignment
        let align: 'center' | 'left' | 'right' = 'center'

        // If centered, left edge would be:
        const potentialLeft = triggerCenter - tooltipWidth / 2
        const potentialRight = triggerCenter + tooltipWidth / 2

        if (potentialLeft < 10) {
            align = 'left' // Align to left edge of trigger (or slightly offset)
        } else if (potentialRight > viewportWidth - 10) {
            align = 'right' // Align to right edge
        }

        setHorizontalAlign(align)
    }

    // Recalculate when becoming visible
    useEffect(() => {
        if (isVisible) {
            // Need a slight delay or double-render to get correct tooltip dimensions if it was hidden
            // But with "opacity-0" it might be rendered but invisible.
            // Let's assume it's rendered but hidden.
            requestAnimationFrame(calculatePosition)
        }
    }, [isVisible])

    return (
        <div
            className={`relative inline-block ${className}`}
            onMouseEnter={() => setIsVisible(true)}
            onMouseLeave={() => setIsVisible(false)}
            ref={triggerRef}
        >
            {children}

            {/* Tooltip Portal could be better, but relative positioning works if z-index is high enough */}
            <div
                ref={tooltipRef}
                className={`
                    absolute z-50 w-64 px-3 py-2 text-xs text-white bg-gray-900 rounded-lg shadow-lg pointer-events-none transition-opacity duration-200
                    ${isVisible ? 'opacity-100' : 'opacity-0'}
                    ${position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'}
                    ${horizontalAlign === 'center' ? 'left-1/2 -translate-x-1/2' : ''}
                    ${horizontalAlign === 'left' ? 'left-0' : ''}
                    ${horizontalAlign === 'right' ? 'right-0' : ''}
                `}
                style={{ width: 'max-content', maxWidth: '16rem' }}
            >
                {content}

                {/* Arrow */}
                <div
                    className={`
                        absolute w-2 h-2 bg-gray-900 rotate-45
                        ${position === 'top' ? 'bottom-[-4px]' : 'top-[-4px]'}
                        ${horizontalAlign === 'center' ? 'left-1/2 -translate-x-1/2' : ''}
                        ${horizontalAlign === 'left' ? 'left-4' : ''}
                        ${horizontalAlign === 'right' ? 'right-4' : ''}
                    `}
                />
            </div>
        </div>
    )
}
