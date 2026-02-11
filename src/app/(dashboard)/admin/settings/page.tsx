"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { Save } from "lucide-react"

export default function SystemSettingsPage() {
    const [settings, setSettings] = useState<Record<string, string>>({})
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState("")

    useEffect(() => {
        fetchSettings()
    }, [])

    const fetchSettings = async () => {
        const { data, error } = await supabase.from('system_settings').select('*')
        if (data) {
            const map: Record<string, string> = {}
            data.forEach((item: any) => {
                map[item.key] = item.value
            })
            setSettings(map)
        }
        setLoading(false)
    }

    const handleChange = (key: string, value: string) => {
        setSettings(prev => ({ ...prev, [key]: value }))
    }

    const handleSave = async () => {
        setSaving(true)
        setMessage("")

        // Upsert each setting
        const updates = Object.entries(settings).map(([key, value]) => ({
            key,
            value,
            description: getDescription(key) // Optional: function to get description
        }))

        const { error } = await supabase.from('system_settings').upsert(updates)

        if (error) {
            setMessage("保存失败: " + error.message)
        } else {
            setMessage("设置已保存！")
        }
        setSaving(false)
    }

    const getDescription = (key: string) => {
        switch (key) {
            case 'baidu_ocr_api_key': return 'Baidu OCR API Key';
            case 'baidu_ocr_secret_key': return 'Baidu OCR Secret Key';
            case 'llm_provider': return 'LLM Provider (deepseek, openai)';
            case 'llm_api_key': return 'LLM API Key';
            default: return '';
        }
    }

    if (loading) return <div>加载中...</div>

    return (
        <div className="max-w-2xl mx-auto space-y-8">
            <div>
                <h2 className="text-2xl font-bold text-gray-900">系统设置</h2>
                <p className="mt-1 text-sm text-gray-500">
                    配置第三方服务接口 (OCR, LLM)
                </p>
            </div>

            <div className="bg-white shadow rounded-lg p-6 space-y-6">
                {/* OCR Section */}
                <div>
                    <h3 className="text-lg font-medium leading-6 text-gray-900 border-b pb-2 mb-4">百度 OCR 配置</h3>
                    <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                        <div className="sm:col-span-6">
                            <label className="block text-sm font-medium text-gray-700">API Key</label>
                            <input
                                type="text"
                                value={settings['baidu_ocr_api_key'] || ''}
                                onChange={(e) => handleChange('baidu_ocr_api_key', e.target.value)}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                            />
                        </div>
                        <div className="sm:col-span-6">
                            <label className="block text-sm font-medium text-gray-700">Secret Key</label>
                            <input
                                type="password"
                                value={settings['baidu_ocr_secret_key'] || ''}
                                onChange={(e) => handleChange('baidu_ocr_secret_key', e.target.value)}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                            />
                        </div>
                    </div>
                </div>

                {/* LLM Section */}
                <div>
                    <h3 className="text-lg font-medium leading-6 text-gray-900 border-b pb-2 mb-4">大模型 (LLM) 配置</h3>
                    <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                        <div className="sm:col-span-3">
                            <label className="block text-sm font-medium text-gray-700">Provider</label>
                            <select
                                value={settings['llm_provider'] || 'deepseek'}
                                onChange={(e) => handleChange('llm_provider', e.target.value)}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                            >
                                <option value="deepseek">DeepSeek</option>
                                <option value="openai">OpenAI</option>
                            </select>
                        </div>
                        <div className="sm:col-span-6">
                            <label className="block text-sm font-medium text-gray-700">API Key</label>
                            <input
                                type="password"
                                value={settings['llm_api_key'] || ''}
                                onChange={(e) => handleChange('llm_api_key', e.target.value)}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                            />
                        </div>
                    </div>
                </div>

                {/* Save Button */}
                <div className="flex items-center justify-between pt-4">
                    <span className={`text-sm ${message.includes('失败') ? 'text-red-500' : 'text-green-500'}`}>
                        {message}
                    </span>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                    >
                        <Save className="mr-2 h-4 w-4" />
                        {saving ? "保存中..." : "保存配置"}
                    </button>
                </div>
            </div>
        </div>
    )
}
