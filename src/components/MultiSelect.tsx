"use client"

import React, { useState, useRef, useEffect } from "react"
import { ChevronDown, X, Check } from "lucide-react"

interface Option {
    label: string
    value: string
}

interface MultiSelectProps {
    options: Option[]
    selected: string[]
    onChange: (selected: string[]) => void
    placeholder?: string
    className?: string
}

export default function MultiSelect({ options, selected, onChange, placeholder = "Select...", className = "" }: MultiSelectProps) {
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    const toggleOption = (value: string) => {
        if (selected.includes(value)) {
            onChange(selected.filter((item) => item !== value))
        } else {
            onChange([...selected, value])
        }
    }

    const removeOption = (value: string, e: React.MouseEvent) => {
        e.stopPropagation()
        onChange(selected.filter((item) => item !== value))
    }

    // Get selected labels for display
    const selectedLabels = options
        .filter(opt => selected.includes(opt.value))
        .map(opt => opt.label)

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            <div
                className="min-h-[38px] w-full border border-gray-300 rounded-md bg-white px-3 py-1.5 flex items-center justify-between cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 hover:border-gray-400"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex flex-wrap gap-1 items-center">
                    {selected.length === 0 && (
                        <span className="text-gray-400 text-sm">{placeholder}</span>
                    )}
                    {selectedLabels.map((label, index) => (
                        <span key={index} className="bg-indigo-50 text-indigo-700 text-xs px-2 py-0.5 rounded flex items-center border border-indigo-100">
                            {label}
                            <X
                                className="ml-1 w-3 h-3 hover:text-indigo-900 cursor-pointer"
                                onClick={(e) => removeOption(options.find(o => o.label === label)?.value || "", e)}
                            />
                        </span>
                    ))}
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </div>

            {isOpen && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto animate-in fade-in zoom-in-95 duration-100">
                    {options.map((option) => (
                        <div
                            key={option.value}
                            className={`px-3 py-2 text-sm cursor-pointer flex items-center justify-between hover:bg-gray-50
                                ${selected.includes(option.value) ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-700"}
                            `}
                            onClick={() => toggleOption(option.value)}
                        >
                            <span>{option.label}</span>
                            {selected.includes(option.value) && <Check className="w-4 h-4 text-indigo-600" />}
                        </div>
                    ))}
                    {options.length === 0 && (
                        <div className="px-3 py-2 text-sm text-gray-400 text-center">No options</div>
                    )}
                </div>
            )}
        </div>
    )
}
