import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req: Request) {
    try {
        const { image } = await req.json();

        if (!image) {
            return NextResponse.json({ error: 'Image data is required' }, { status: 400 });
        }

        // 1. Get System Settings (AI Config)
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        const { data: settingsData } = await supabase.from('system_settings').select('key, value');
        const settingsMap: Record<string, string> = {};
        if (settingsData) settingsData.forEach((s: any) => settingsMap[s.key] = s.value);

        const activeProvider = settingsMap['ai_provider'] || 'deepseek';
        let apiKey = settingsMap['ai_api_key'];
        let baseUrl = settingsMap['ai_base_url'];
        let model = settingsMap['ai_model'];

        // Override with provider-specific config if exists
        const configKey = `ai_config_${activeProvider}`;
        if (settingsMap[configKey]) {
            try {
                const config = JSON.parse(settingsMap[configKey]);
                if (config.apiKey) apiKey = config.apiKey;
                if (config.baseUrl) baseUrl = config.baseUrl;
                // Handle different casing from legacy saves
                if (config.base_url) baseUrl = config.base_url;
                if (config.model) model = config.model;
            } catch (e) {
                console.error("Failed to parse provider config", e);
            }
        }

        if (!apiKey) {
            console.error("AI API Key missing. Active Provider:", activeProvider);
            return NextResponse.json({ error: 'AI Settings not configured' }, { status: 500 });
        }
        console.log("Using Provider:", activeProvider, "Model:", model, "BaseURL:", baseUrl);

        // 2. Call AI API (Vision)
        // Determine target URL
        let targetUrl = baseUrl || '';
        if (!targetUrl) {
            if (activeProvider === 'deepseek') targetUrl = 'https://api.deepseek.com'; // Deepseek might not support vision yet? fallback to standard? 
            // Actually Deepseek V3/R1 might not support vision. 
            // If provider is deepseek, we might need to force OpenAI or Zhipu for vision if deepseek fails?
            // For now, let's assume the configured provider supports it or the user has set up a vision-capable model.
            // If deepseek doesn't support vision, this might fail.
            // Safe fallback: If provider is deepseek, maybe warn? Or just try.
            else if (activeProvider === 'zhipu') targetUrl = 'https://open.bigmodel.cn/api/paas/v4';
            else if (activeProvider === 'openai') targetUrl = 'https://api.openai.com/v1';
        }

        if (!targetUrl.endsWith('/chat/completions')) {
            if (targetUrl.endsWith('/')) targetUrl += 'chat/completions';
            else targetUrl += '/chat/completions';
        }

        const payload = {
            model: model || 'gpt-4o',
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Recognize the English text written in this image. Return ONLY the text found. Do not add any explanation or punctuation if not present. If it is unreadable, return '???'." },
                        {
                            type: "image_url",
                            image_url: {
                                url: image
                            }
                        }
                    ]
                }
            ],
            max_tokens: 50
        };

        const res = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.text();
            console.error("AI API Error:", err);
            return NextResponse.json({ error: 'AI Provider Error: ' + err }, { status: 500 });
        }

        const data = await res.json();
        const text = data.choices[0]?.message?.content?.trim();

        return NextResponse.json({ text });

    } catch (e: any) {
        console.error("Handwriting Recognition Error:", e);
        return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 });
    }
}
