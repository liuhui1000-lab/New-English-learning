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

type OCRProviderConfig = {
    apiUrl: string
    token: string
}

type ProviderMeta = {
    id: string
    name: string
    defaultBaseUrl?: string
    defaultModel?: string
    defaultApiUrl?: string
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

const OCR_PROVIDERS: ProviderMeta[] = [
    { id: 'paddle', name: 'PaddleOCR (百度飞桨)', defaultApiUrl: 'https://5ejew8k4i019dek5.aistudio-app.com/layout-parsing', description: 'Best for layout & table recognition' },
    { id: 'general', name: 'General/Custom OCR', defaultApiUrl: '', description: 'Compatible generic OCR API' }
]

export default function AdminSettingsPage() {
    // State
    const [activeProvider, setActiveProvider] = useState<string | null>(null)
    const [providerConfigs, setProviderConfigs] = useState<Record<string, AIProviderConfig>>({})

    // OCR State
    const [activeOcrProvider, setActiveOcrProvider] = useState<string | null>(null)
    const [ocrProviderConfigs, setOcrProviderConfigs] = useState<Record<string, OCRProviderConfig>>({})

    // Editing State
    const [editingProvider, setEditingProvider] = useState<string | null>(null)
    const [editForm, setEditForm] = useState<AIProviderConfig>({ apiKey: '', baseUrl: '', model: '' })

    // OCR Editing State
    const [editingOcrProvider, setEditingOcrProvider] = useState<string | null>(null)
    const [editOcrForm, setEditOcrForm] = useState<OCRProviderConfig>({ apiUrl: '', token: '' })

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
                let active = 'deepseek' // Default fallback if DB is empty

                const ocrConfigs: Record<string, OCRProviderConfig> = {}
                let activeOcr = 'paddle'

                data.forEach((item: any) => {
                    // AI Configs
                    if (item.key === 'ai_provider') active = item.value
                    if (item.key.startsWith('ai_config_')) {
                        const providerId = item.key.replace('ai_config_', '')
                        try {
                            configs[providerId] = JSON.parse(item.value)
                        } catch (e) {
                            console.error(`Failed to parse config for ${providerId}`)
                        }
                    }

                    // OCR Configs (New)
                    if (item.key === 'ocr_provider') activeOcr = item.value
                    if (item.key.startsWith('ocr_config_')) {
                        const providerId = item.key.replace('ocr_config_', '')
                        try {
                            ocrConfigs[providerId] = JSON.parse(item.value)
                        } catch (e) { console.error('Failed to parse OCR config', e) }
                    }

                    // Legacy OCR fallback (if no new config exists, try to port on UI side)
                    // We can map legacy 'ocr_url' and 'ocr_token' to 'paddle' config if missing
                    if (item.key === 'ocr_url' && !ocrConfigs['paddle']?.apiUrl) {
                        ocrConfigs['paddle'] = { ...ocrConfigs['paddle'] || {}, apiUrl: item.value }
                    }
                    if (item.key === 'ocr_token' && !ocrConfigs['paddle']?.token) {
                        ocrConfigs['paddle'] = { ...ocrConfigs['paddle'] || {}, token: item.value }
                        // Also check legacy names
                    }
                    if (item.key === 'paddle_ocr_token' && !ocrConfigs['paddle']?.token) {
                        ocrConfigs['paddle'] = { ...ocrConfigs['paddle'] || {}, token: item.value }
                    }
                })

                // Ensure paddle has at least defaults or empty structure
                if (!ocrConfigs['paddle']) ocrConfigs['paddle'] = { apiUrl: '', token: '' }

                setActiveProvider(active)
                setProviderConfigs(configs)

                setActiveOcrProvider(activeOcr)
                setOcrProviderConfigs(ocrConfigs)
            }
        } catch (e: any) {
            console.error('Failed to fetch settings:', e)
        }
        setLoading(false)
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

    // OCR Handlers
    const openOcrEditModal = (providerId: string) => {
        const currentConfig = ocrProviderConfigs[providerId] || {
            apiUrl: OCR_PROVIDERS.find(p => p.id === providerId)?.defaultApiUrl || '',
            token: ''
        }
        setEditOcrForm(currentConfig)
        setEditingOcrProvider(providerId)
    }

    const saveOcrProviderConfig = async () => {
        if (!editingOcrProvider) return
        setSaving(true)

        const newConfigs = { ...ocrProviderConfigs, [editingOcrProvider]: editOcrForm }

        try {
            // Save specific config
            await upsertSettings([{
                key: `ocr_config_${editingOcrProvider}`,
                value: JSON.stringify(editOcrForm)
            }])

            // Also sync legacy keys if it's Paddle for backward compatibility?
            // Or just let /api/ocr handle the new keys? 
            // Best to rely on /api/ocr updating to read active provider.

            setOcrProviderConfigs(newConfigs)
            setMessage({ type: 'success', text: 'OCR 配置已保存' })
            setEditingOcrProvider(null)
        } catch (e: any) {
            setMessage({ type: 'error', text: '保存失败: ' + e.message })
        }
        setSaving(false)
    }

    const handleActivateOcrProvider = async (providerId: string) => {
        setSaving(true)
        try {
            await upsertSettings([{ key: 'ocr_provider', value: providerId }])
            setActiveOcrProvider(providerId)
            setMessage({ type: 'success', text: `OCR 已切换至 ${OCR_PROVIDERS.find(p => p.id === providerId)?.name}` })
        } catch (e: any) {
            setMessage({ type: 'error', text: '切换失败: ' + e.message })
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

                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="h-40 bg-gray-50/50 border-2 border-dashed border-gray-200 rounded-xl animate-pulse p-5">
                                <div className="h-6 w-1/3 bg-gray-200 rounded mb-2"></div>
                                <div className="h-4 w-1/2 bg-gray-200 rounded mb-8"></div>
                                <div className="h-10 w-full bg-gray-200 rounded mt-auto"></div>
                            </div>
                        ))}
                    </div>
                ) : (
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
                )}
            </div>

            {/* OCR Providers Section */}
            <div className="space-y-4">
                <h3 className="text-lg font-bold text-gray-900 border-b pb-2">OCR 文字识别配置 (多线路管理)</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {OCR_PROVIDERS.map(provider => {
                        const config = ocrProviderConfigs[provider.id] || { apiUrl: '', token: '' }
                        const isConfigured = !!config.apiUrl || !!config.token
                        const isActive = activeOcrProvider === provider.id

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
                                        <div className="truncate">URL: {config.apiUrl}</div>
                                        <div className="truncate">Token: {config.token ? '********' : '(Empty)'}</div>
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex space-x-2 mt-auto">
                                    <button
                                        onClick={() => openOcrEditModal(provider.id)}
                                        className="flex-1 bg-white border border-gray-300 text-gray-700 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition flex items-center justify-center"
                                    >
                                        <Edit2 className="w-3 h-3 mr-1" /> 配置
                                    </button>

                                    {isConfigured && !isActive && (
                                        <button
                                            onClick={() => handleActivateOcrProvider(provider.id)}
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

                            {/* Test Connection Button */}
                            <div className="pt-2">
                                <button
                                    type="button"
                                    onClick={async () => {
                                        const btn = document.getElementById('test-btn');
                                        if (btn) btn.innerText = '测试中...';
                                        try {
                                            const res = await fetch('/api/ai/test', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    provider: editingProvider,
                                                    apiKey: editForm.apiKey,
                                                    baseUrl: editForm.baseUrl,
                                                    model: editForm.model
                                                })
                                            });
                                            const data = await res.json();
                                            if (res.ok) {
                                                alert('✅ 连接成功！\n响应: ' + JSON.stringify(data.data?.choices?.[0]?.message || 'OK'));
                                            } else {
                                                alert('❌ 连接失败: ' + (data.error || 'Unknown error'));
                                            }
                                        } catch (err: any) {
                                            alert('❌ 网络错误: ' + err.message);
                                        } finally {
                                            if (btn) btn.innerText = '测试连接';
                                        }
                                    }}
                                    id="test-btn"
                                    className="text-indigo-600 text-sm hover:underline flex items-center"
                                >
                                    <Server className="w-4 h-4 mr-1" /> 测试连接 (Test Connection)
                                </button>
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

            {/* OCR Edit Modal */}
            {editingOcrProvider && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                        <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-gray-900">
                                配置 {OCR_PROVIDERS.find(p => p.id === editingOcrProvider)?.name}
                            </h3>
                            <button onClick={() => setEditingOcrProvider(null)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">API Endpoint URL</label>
                                <input
                                    type="text"
                                    value={editOcrForm.apiUrl}
                                    onChange={e => setEditOcrForm({ ...editOcrForm, apiUrl: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 font-mono text-sm"
                                    placeholder="https://..."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">API Token / Key</label>
                                <input
                                    type="password"
                                    value={editOcrForm.token}
                                    onChange={e => setEditOcrForm({ ...editOcrForm, token: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 font-mono text-sm"
                                    placeholder="..."
                                />
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-gray-50 flex justify-end space-x-3">
                            <button
                                onClick={() => setEditingOcrProvider(null)}
                                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
                            >
                                取消
                            </button>
                            <button
                                onClick={saveOcrProviderConfig}
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
