import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const maxDuration = 60; // Allow up to 60 seconds for OCR processing

// Configuration for Paddle OCR (Layout Parsing)
const PADDLE_API_URL = "https://5ejew8k4i019dek5.aistudio-app.com/layout-parsing";
// Default token provided by user, but prefer Env/DB
const DEFAULT_TOKEN = "483605608bc2d69ed9979463871dd4bc6095285a";

/**
 * Clean OCR text from common misrecognitions
 */
function cleanOCRText(text: string): string {
    return text
        // Remove Markdown Headers (## Title) which PaddleOCR Layout often adds to single lines
        .replace(/^#+\s+/gm, '')
        // Convert LaTeX underline to HTML: $ \underline{\text{in two months}} $ → <u>in two months</u>
        .replace(/\$\s*\\underline\{\\text\{([^}]+)\}\}\s*\$/g, '<u>$1</u>')
        // Empty underline becomes blank: $ \underline{\text{}} $ → ____
        .replace(/\$\s*\\underline\{\\text\{\}\}\s*\$/g, '____')
        // Remove LaTeX text wrappers: $ \text{content} $ → content
        .replace(/\$\s*\\text\{([^}]*)\}\s*\$/g, '$1')
        // Remove standalone $ symbols that might be LaTeX artifacts
        .replace(/\s\$\s/g, ' ')
        // Clean up multiple spaces
        .replace(/\s{2,}/g, ' ')
        // Clean up multiple underscores (normalize to 4)
        .replace(/_{5,}/g, '____')
        .trim();
}

export async function POST(req: NextRequest) {
    try {
        const cookieStore = await cookies()
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll()
                    },
                    setAll(cookiesToSet) {
                        // Ignoring writes in GET/POST API usually fine
                    },
                },
            }
        )

        // 1. Get Settings from DB
        const body = await req.json();
        const { image } = body;

        // Allow explicit config override for testing
        let token = body.token || process.env.PADDLE_OCR_TOKEN || process.env.BAIDU_OCR_API_KEY;
        let apiUrl = body.apiUrl || PADDLE_API_URL;

        const { data: settings } = await supabase
            .from('system_settings')
            .select('*')
            .or('key.eq.ocr_token,key.eq.ocr_url,key.eq.paddle_ocr_token,key.eq.baidu_ocr_api_key,key.eq.ocr_provider,key.like.ocr_config_%');

        if (settings) {
            if (map['ocr_url'] && !body.apiUrl) apiUrl = map['ocr_url'];

            // Only override if not provided in body
            if (!body.token) {
                if (map['ocr_token']) {
                    token = map['ocr_token'];
                    console.log("Using DB 'ocr_token':", token.substring(0, 5) + "...");
                }
                else if (map['paddle_ocr_token']) {
                    token = map['paddle_ocr_token'];
                    console.log("Using DB 'paddle_ocr_token':", token.substring(0, 5) + "...");
                }
                else if (map['baidu_ocr_api_key']) {
                    token = map['baidu_ocr_api_key'];
                    console.log("Using DB 'baidu_ocr_api_key':", token.substring(0, 5) + "...");
                }
            }
        }

        // Fallback
        if (!token) {
            token = DEFAULT_TOKEN;
            console.warn("Using Default Token (likely invalid/expired). Check system settings.");
        } else if (token === process.env.PADDLE_OCR_TOKEN) {
            console.log("Using Env 'PADDLE_OCR_TOKEN'");
        }


        if (!image) return NextResponse.json({ error: "No image provided" }, { status: 400 });

        // 2. Prepare Payload
        const payload = {
            file: image,
            fileType: 1,
            useDocOrientationClassify: false,
            useDocUnwarping: false,
            useChartRecognition: false
        };

        // 3. Call External API
        console.log("Calling OCR API:", apiUrl);
        const response = await fetch(apiUrl, {
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

            // Clean OCR artifacts
            const cleanedText = cleanOCRText(fullMarkdown);
            return NextResponse.json({ text: cleanedText });
        }

        // Priority 2: Standard PP-OCRv5 (Plain Text) - from Doc Link
        if (result.result && result.result.ocrResults) {
            const ocrResults = result.result.ocrResults;
            const text = ocrResults.map((r: any) => r.words || r.text || "").join("\n");
            const cleanedText = cleanOCRText(text);
            return NextResponse.json({ text: cleanedText });
        }

        throw new Error("Invalid response structure: No layoutParsingResults or ocrResults found");

    } catch (error: any) {
        console.error("OCR Proxy Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
