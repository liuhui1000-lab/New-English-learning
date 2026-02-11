import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase"; // Use admin client if needed for settings, but here we can use what we have or env vars

// Helper to get Access Token
async function getAccessToken(apiKey: string, secretKey: string) {
    const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`;
    const resp = await fetch(url, { method: 'POST' });
    const data = await resp.json();
    return data.access_token;
}

export async function POST(req: NextRequest) {
    try {
        // 1. Get Settings from DB (or Env)
        // For MVP, we try Env first, then DB
        // 1. Get Settings from DB (or Env)
        let apiKey = process.env.BAIDU_OCR_API_KEY;
        let secretKey = process.env.BAIDU_OCR_SECRET_KEY;

        // If not in Env, fetch from system_settings via Supabase
        if (!apiKey) {
            const { data: settings } = await supabase
                .from('system_settings')
                .select('*')
                .in('key', ['baidu_ocr_api_key', 'baidu_ocr_secret_key']);

            if (settings) {
                const map: Record<string, string> = {};
                settings.forEach((s: any) => map[s.key] = s.value);
                apiKey = map['baidu_ocr_api_key'];
                secretKey = map['baidu_ocr_secret_key'];
            }
        }

        if (!apiKey) {
            return NextResponse.json({ error: "OCR Configuration Missing (Please configure in Admin Settings)" }, { status: 500 });
        }

        const { image } = await req.json(); // Base64 image
        if (!image) return NextResponse.json({ error: "No image provided" }, { status: 400 });

        // 2. Get Token
        let token = "";
        if (!secretKey) {
            // Support "Direct Access Token" mode (User provided only one key)
            // If Secret Key is empty, we assume API Key IS the Access Token
            token = apiKey;
        } else {
            // Standard Mode: Exchange AK + SK for Token
            token = await getAccessToken(apiKey, secretKey);
        }

        // 3. Call OCR (General Basic or High Accuracy)
        // Using 'general_basic' for speed, or 'webimage'
        const ocrUrl = `https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic?access_token=${token}`;

        const params = new URLSearchParams();
        params.append('image', image);

        // Baidu requires Content-Type: application/x-www-form-urlencoded
        const ocrResp = await fetch(ocrUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params
        });

        const result = await ocrResp.json();

        if (result.error_code) {
            throw new Error(result.error_msg);
        }

        // 4. Extract Text
        const text = result.words_result.map((w: any) => w.words).join(" ");

        return NextResponse.json({ text });

    } catch (error: any) {
        console.error("OCR Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
