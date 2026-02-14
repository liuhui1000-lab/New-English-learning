"use client"

import { useState, useEffect } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Save, AlertCircle, CheckCircle, Cpu } from "lucide-react"

export default function AdminSettingsPage() {
    // State
    const [settings, setSettings] = useState({
        ai_provider: 'deepseek',
        ai_api_key: '',
        ai_base_url: 'https://api.deepseek.com',
        ai_model: 'deepseek-chat'
    })

    // Status
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    useEffect(() => {
        fetchSettings()
    }, [])

    const fetchSettings = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('system_settings')
            .select('key, value')

        if (data) {
            const newSettings: any = { ...settings }
            data.forEach((item: any) => {
                if (newSettings.hasOwnProperty(item.key)) {
                    newSettings[item.key] = item.value
                }
            })
            setSettings(newSettings)
        }
        setLoading(false)
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setSettings({ ...settings, [e.target.name]: e.target.value })
    }

    const handleSave = async () => {
        setSaving(true)
        setMessage(null)

        const updates = Object.entries(settings).map(([key, value]) => ({
            key,
            value,
            updated_at: new Date().toISOString()
        }))

        const { error } = await supabase
            .from('system_settings')
            .upsert(updates)

        if (error) {
            setMessage({ type: 'error', text: '保存失败: ' + error.message })
        } else {
            setMessage({ type: 'success', text: '设置已更新' })
        }
        setSaving(false)
    }

    const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const provider = e.target.value
        let baseUrl = settings.ai_base_url
        let model = settings.ai_model

        if (provider === 'deepseek') {
            baseUrl = 'https://api.deepseek.com'
            model = 'deepseek-chat'
        } else if (provider === 'zhipu') {
            baseUrl = 'https://open.bigmodel.cn/api/paas/v4'
            model = 'glm-4'
        } else if (provider === 'openai') {
            baseUrl = 'https://api.openai.com/v1'
            model = 'gpt-3.5-turbo'
        }

        setSettings({ ...settings, ai_provider: provider, ai_base_url: baseUrl, ai_model: model })
    }

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <h2 className="text-2xl font-bold text-gray-900 flex items-center">
                <Cpu className="mr-2" />
                系统设置
            </h2>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-lg font-bold text-gray-900 mb-4 border-b pb-2">
                    AI 自动打标配置
                </h3>

                <div className="space-y-4">
                    {/* Provider */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">AI 供应商</label>
                        <select
                            name="ai_provider"
                            value={settings.ai_provider}
                            onChange={handleProviderChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                        >
                            <option value="deepseek">DeepSeek (深度求索)</option>
                            <option value="zhipu">Zhipu AI (智谱清言)</option>
                            <option value="openai">OpenAI (GPT)</option>
                        </select>
                    </div>

                    {/* API Key */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                        <input
                            type="password"
                            name="ai_api_key"
                            value={settings.ai_api_key}
                            onChange={handleChange}
                            placeholder="sk-..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 font-mono"
                        />
                        <p className="text-xs text-gray-400 mt-1">Key stored securely.</p>
                    </div>

                    {/* Base URL */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
                        <input
                            type="text"
                            name="ai_base_url"
                            value={settings.ai_base_url}
                            onChange={handleChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm"
                        />
                    </div>

                    {/* Model */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Model Name</label>
                        <input
                            type="text"
                            name="ai_model"
                            value={settings.ai_model}
                            onChange={handleChange}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm"
                        />
                    </div>
                </div>

                <div className="mt-8 flex items-center justify-between">
                    <div className="text-sm">
                        {message && (
                            <div className={`flex items-center ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                                {message.type === 'success' ? <CheckCircle className="w-4 h-4 mr-1" /> : <AlertCircle className="w-4 h-4 mr-1" />}
                                {message.text}
                            </div>
                        )}
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition flex items-center disabled:opacity-50"
                    >
                        {saving ? '保存中...' : (
                            <>
                                <Save className="w-4 h-4 mr-2" />
                                保存设置
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
