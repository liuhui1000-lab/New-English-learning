
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const { provider, apiKey, baseUrl, model } = await req.json();

        if (!apiKey) {
            return NextResponse.json({ error: 'Missing API Key' }, { status: 400 });
        }

        // Default URLs if not provided
        let targetUrl = baseUrl;
        if (!targetUrl) {
            if (provider === 'deepseek') targetUrl = 'https://api.deepseek.com';
            else if (provider === 'zhipu') targetUrl = 'https://open.bigmodel.cn/api/paas/v4';
            else if (provider === 'openai') targetUrl = 'https://api.openai.com/v1';
        }

        // Ensure URL ends with /v1 or /chat/completions (DeepSeek/OpenAI standard)
        // Adjust based on provider if needed, but most follow OpenAI format now.
        // If baseUrl is just the host, append /chat/completions
        if (!targetUrl.endsWith('/chat/completions')) {
            if (targetUrl.endsWith('/')) targetUrl += 'chat/completions';
            else targetUrl += '/chat/completions';
        }

        // Prepare request
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model || 'deepseek-chat',
                messages: [{ role: 'user', content: 'Hi' }],
                max_tokens: 1
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API responded with ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        return NextResponse.json({ success: true, message: 'Connection successful', data });

    } catch (error: any) {
        console.error('AI Test Error:', error);
        return NextResponse.json({
            error: error.message || 'Connection failed',
            details: String(error)
        }, { status: 500 });
    }
}
