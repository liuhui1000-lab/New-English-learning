import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const maxDuration = 60; // Allow up to 60 seconds for OCR processing

// Configuration for Paddle OCR (Layout Parsing)
const PADDLE_API_URL = "https://5ejew8k4i019dek5.aistudio-app.com/layout-parsing";
// Default token provided by user, but prefer Env/DB
const DEFAULT_TOKEN = "483605608bc2d69ed9979463871dd4bc6095285a";

export async function POST(req: NextRequest) {
    try {
        // 1. Get Token (Env -> DB -> Default)
        let token = process.env.PADDLE_OCR_TOKEN || process.env.BAIDU_OCR_API_KEY; // Reusing var for convenience

        if (!token) {
            const { data: settings } = await supabase
                .from('system_settings')
                .select('*')
                .in('key', ['baidu_ocr_api_key', 'paddle_ocr_token']);

            if (settings) {
                const map: Record<string, string> = {};
                settings.forEach((s: any) => map[s.key] = s.value);
                token = map['paddle_ocr_token'] || map['baidu_ocr_api_key'];
            }
        }

        // Fallback to the user-provided token if nothing configured (for immediate testing)
        if (!token) {
            token = DEFAULT_TOKEN;
            // console.warn("Using hardcoded default Paddle Token");
        }

        const { image } = await req.json(); // Base64 image
        if (!image) return NextResponse.json({ error: "No image provided" }, { status: 400 });

        // 2. Prepare Payload for Layout Parsing API
        // fileType: 1 for Images (since we slice PDFs in parser.ts)
        const payload = {
            file: image,
            fileType: 1,
            useDocOrientationClassify: false,
            useDocUnwarping: false,
            useChartRecognition: false
        };

        // 3. Call External API
        const response = await fetch(PADDLE_API_URL, {
            method: 'POST',
            headers: {
                "Authorization": `token ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();

            // Handle Quota / Rate Limit explicitly
            if (response.status === 429) {
                return NextResponse.json({ error: "OCR Quota Exceeded (429). Please try again tomorrow." }, { status: 429 });
            }
            if (response.status === 401 || response.status === 403) {
                return NextResponse.json({ error: "OCR API Key Invalid or expired." }, { status: 401 });
            }

            throw new Error(`Paddle API Error: ${response.status} ${errText.substring(0, 100)}`);
        }

        const result = await response.json();

        // Check for error codes (support both errorCode and error_code standards)
        if (result.errorCode !== undefined && result.errorCode !== 0) {
            throw new Error(result.errorMsg || "Unknown Error");
        }
        if (result.error_code !== undefined && result.error_code !== 0) {
            throw new Error(result.error_msg || "Unknown Error");
        }

        // 4. Parse Response
        // Priority 1: Layout Parsing (Markdown) - from User's Script
        if (result.result && result.result.layoutParsingResults) {
            const parsingResults = result.result.layoutParsingResults;
            let fullMarkdown = "";

            for (const res of parsingResults) {
                if (res.markdown && res.markdown.text) {
                    fullMarkdown += res.markdown.text + "\n\n";
                }
            }
            return NextResponse.json({ text: fullMarkdown });
        }

        // Priority 2: Standard PP-OCRv5 (Plain Text) - from Doc Link
        if (result.result && result.result.ocrResults) {
            const ocrResults = result.result.ocrResults;
            const text = ocrResults.map((r: any) => r.words || r.text || "").join("\n");
            return NextResponse.json({ text });
        }

        throw new Error("Invalid response structure: No layoutParsingResults or ocrResults found");

    } catch (error: any) {
        console.error("OCR Proxy Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
