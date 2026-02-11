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
        let apiKey = process.env.BAIDU_OCR_API_KEY;
        let secretKey = process.env.BAIDU_OCR_SECRET_KEY;

        // If not in Env, fetch from system_settings via Supabase
        if (!apiKey || !secretKey) {
            // Note: This requires the supabase client to have access (anon key might not read system_settings if RLS is strict)
            // So ideally we use a Service Role key here, or ensure system_settings is readable.
            // For now, let's assume Env vars are set or we skip.
            // In a real app, use Service Role Client.
        }

        if (!apiKey || !secretKey) {
            return NextResponse.json({ error: "OCR Configuration Missing" }, { status: 500 });
        }

        const { image } = await req.json(); // Base64 image
        if (!image) return NextResponse.json({ error: "No image provided" }, { status: 400 });

        // 2. Get Token
        const token = await getAccessToken(apiKey, secretKey);

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
