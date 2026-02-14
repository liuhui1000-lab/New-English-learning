"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { Save, AlertCircle, CheckCircle, Cpu, Edit2, Check, X, Server } from "lucide-react"

// Types
type AIProviderConfig = {
    apiKey: string
    baseUrl: string
    model: string
}

type ProviderMeta = {
    id: string
    name: string
    defaultBaseUrl: string
    defaultModel: string
    description?: string
}

const AI_PROVIDERS: ProviderMeta[] = [
    { id: 'deepseek', name: 'DeepSeek (深度求索)', defaultBaseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-chat', description: 'Recommended for reasoning' },
    { id: 'zhipu', name: 'Zhipu AI (智谱清言)', defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-5', description: 'Latest flagship model' },
    { id: 'moonshot', name: 'Moonshot (Kimi)', defaultBaseUrl: 'https://api.moonshot.cn/v1', defaultModel: 'moonshot-v1-8k', description: 'Long context support' },
    { id: 'qwen', name: 'Qwen (通义千问)', defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen-turbo', description: 'Alibaba Cloud' },
    { id: 'doubao', name: 'Doubao (豆包)', defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3', defaultModel: 'doubao-pro-32k', description: 'ByteDance Volcengine' },
    { id: 'openai', name: 'OpenAI (GPT)', defaultBaseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-3.5-turbo', description: 'Global Standard' },
]

export default function AdminSettingsPage() {
    // State
    const [activeProvider, setActiveProvider] = useState<string>('deepseek')
    const [providerConfigs, setProviderConfigs] = useState<Record<string, AIProviderConfig>>({})

    // OCR State
    const [ocrConfig, setOcrConfig] = useState({
        url: '',
        token: ''
    })

    // Editing State
    const [editingProvider, setEditingProvider] = useState<string | null>(null)
    const [editForm, setEditForm] = useState<AIProviderConfig>({ apiKey: '', baseUrl: '', model: '' })

    // Status
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

    useEffect(() => {
        fetchSettings()
    }, [])

    // Helper: Upsert settings directly via Supabase client
    const upsertSettings = async (updates: { key: string, value: string }[]) => {
        const upsertData = updates.map(u => ({
            key: u.key,
            value: u.value,
            updated_at: new Date().toISOString()
        }))
        const { error } = await supabase
            .from('system_settings')
            .upsert(upsertData)
        if (error) throw new Error(error.message)
    }

    const fetchSettings = async () => {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('system_settings')
                .select('key, value')

            if (error) throw error

            if (data) {
                const configs: Record<string, AIProviderConfig> = {}
                let active = 'deepseek'
                let ocr = { url: '', token: '' }

                data.forEach((item: any) => {
                    if (item.key === 'ai_provider') active = item.value
                    if (item.key.startsWith('ai_config_')) {
                        const providerId = item.key.replace('ai_config_', '')
                        try {
                            configs[providerId] = JSON.parse(item.value)
                        } catch (e) {
                            console.error(`Failed to parse config for ${providerId}`)
                        }
                    }
                    if (item.key === 'ocr_url') ocr.url = item.value
                    if (item.key === 'ocr_token') ocr.token = item.value
                })

                setActiveProvider(active)
                setProviderConfigs(configs)
                setOcrConfig(ocr)
            }
        } catch (e: any) {
            console.error('Failed to fetch settings:', e)
        }
        setLoading(false)
    }

    const handleSaveOCR = async () => {
        setSaving(true)
        try {
            await upsertSettings([
                { key: 'ocr_url', value: ocrConfig.url },
                { key: 'ocr_token', value: ocrConfig.token }
            ])
            setMessage({ type: 'success', text: 'OCR 配置已保存' })
        } catch (e: any) {
            setMessage({ type: 'error', text: 'OCR 保存失败: ' + e.message })
        }
        setSaving(false)
    }

    const handleActivateProvider = async (providerId: string) => {
        setSaving(true)
        try {
            await upsertSettings([{ key: 'ai_provider', value: providerId }])
            setActiveProvider(providerId)
            setMessage({ type: 'success', text: `已切换至 ${AI_PROVIDERS.find(p => p.id === providerId)?.name}` })
        } catch (e: any) {
            setMessage({ type: 'error', text: '切换失败: ' + e.message })
        }
        setSaving(false)
    }

    const openEditModal = (providerId: string) => {
        const currentconfig = providerConfigs[providerId] || {
            apiKey: '',
            baseUrl: AI_PROVIDERS.find(p => p.id === providerId)?.defaultBaseUrl || '',
            model: AI_PROVIDERS.find(p => p.id === providerId)?.defaultModel || ''
        }
        setEditForm(currentconfig)
        setEditingProvider(providerId)
    }

    const saveProviderConfig = async () => {
        if (!editingProvider) return
        setSaving(true)

        const newConfigs = { ...providerConfigs, [editingProvider]: editForm }

        try {
            await upsertSettings([{
                key: `ai_config_${editingProvider}`,
                value: JSON.stringify(editForm)
            }])
            setProviderConfigs(newConfigs)
            setMessage({ type: 'success', text: '配置已保存' })
            setEditingProvider(null)
        } catch (e: any) {
            setMessage({ type: 'error', text: '保存失败: ' + e.message })
        }
        setSaving(false)
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-12">

            {/* Header */}
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900 flex items-center">
                    <Cpu className="mr-2" />
                    系统设置
                </h2>
                {message && (
                    <div className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                        }`}>
                        {message.type === 'success' ? <CheckCircle className="w-4 h-4 mr-2" /> : <AlertCircle className="w-4 h-4 mr-2" />}
                        {message.text}
                    </div>
                )}
            </div>

            {/* AI Providers Section */}
            <div className="space-y-4">
                <h3 className="text-lg font-bold text-gray-900 border-b pb-2">AI 模型供应商 (多线路管理)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {AI_PROVIDERS.map(provider => {
                        const isConfigured = !!providerConfigs[provider.id]?.apiKey
                        const isActive = activeProvider === provider.id

                        return (
                            <div key={provider.id} className={`relative p-5 rounded-xl border-2 transition-all ${isActive
                                ? 'border-indigo-500 bg-indigo-50/30'
                                : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm'
                                }`}>
                                {/* Header */}
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <h4 className="font-bold text-gray-900">{provider.name}</h4>
                                        <p className="text-xs text-gray-500 mt-1">{provider.description}</p>
                                    </div>
                                    <div className="flex flex-col items-end space-y-2">
                                        {isActive && (
                                            <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-1 rounded-full font-bold flex items-center">
                                                <Check className="w-3 h-3 mr-1" /> 当前使用
                                            </span>
                                        )}
                                        {!isActive && isConfigured && (
                                            <span className="bg-green-50 text-green-700 text-xs px-2 py-1 rounded-full font-medium">
                                                已配置
                                            </span>
                                        )}
                                        {!isConfigured && (
                                            <span className="bg-gray-100 text-gray-400 text-xs px-2 py-1 rounded-full">
                                                未配置
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Config Info Preview */}
                                {isConfigured && (
                                    <div className="text-xs text-gray-500 font-mono bg-gray-50 p-2 rounded mb-4">
                                        <div className="truncate">URL: {providerConfigs[provider.id].baseUrl}</div>
                                        <div>Model: {providerConfigs[provider.id].model}</div>
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex space-x-2 mt-auto">
                                    <button
                                        onClick={() => openEditModal(provider.id)}
                                        className="flex-1 bg-white border border-gray-300 text-gray-700 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition flex items-center justify-center"
                                    >
                                        <Edit2 className="w-3 h-3 mr-1" /> 配置
                                    </button>

                                    {isConfigured && !isActive && (
                                        <button
                                            onClick={() => handleActivateProvider(provider.id)}
                                            disabled={saving}
                                            className="flex-1 bg-indigo-600 text-white py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50"
                                        >
                                            启用
                                        </button>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* OCR Section */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h3 className="text-lg font-bold text-gray-900">OCR 文字识别配置</h3>
                    <button
                        onClick={handleSaveOCR}
                        disabled={saving}
                        className="text-sm bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-100 font-medium"
                    >
                        保存 OCR 设置
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">OCR API URL</label>
                        <input
                            type="text"
                            value={ocrConfig.url}
                            onChange={e => setOcrConfig({ ...ocrConfig, url: e.target.value })}
                            placeholder="https://..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm font-mono"
                        />
                        <p className="text-xs text-gray-400 mt-1">默认为 PaddleHub / AIStudio Space URL</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Access Token (选填)</label>
                        <input
                            type="password"
                            value={ocrConfig.token}
                            onChange={e => setOcrConfig({ ...ocrConfig, token: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                        />
                    </div>
                </div>
            </div>

            {/* Edit Modal */}
            {editingProvider && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                        <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-gray-900">
                                配置 {AI_PROVIDERS.find(p => p.id === editingProvider)?.name}
                            </h3>
                            <button onClick={() => setEditingProvider(null)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
                                <input
                                    type="text"
                                    value={editForm.baseUrl}
                                    onChange={e => setEditForm({ ...editForm, baseUrl: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 font-mono text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                                <input
                                    type="password"
                                    value={editForm.apiKey}
                                    onChange={e => setEditForm({ ...editForm, apiKey: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 font-mono text-sm"
                                    placeholder="sk-..."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Model Name</label>
                                <input
                                    type="text"
                                    value={editForm.model}
                                    onChange={e => setEditForm({ ...editForm, model: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 font-mono text-sm"
                                />
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-gray-50 flex justify-end space-x-3">
                            <button
                                onClick={() => setEditingProvider(null)}
                                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
                            >
                                取消
                            </button>
                            <button
                                onClick={saveProviderConfig}
                                disabled={saving}
                                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50"
                            >
                                {saving ? '保存中...' : '确认保存'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    )
}
