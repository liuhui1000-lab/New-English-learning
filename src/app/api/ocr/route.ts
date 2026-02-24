import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const maxDuration = 30; // Standard OCR is usually fast

// Configuration for Standard Paddle OCR (Handwriting optimized)
const PADDLE_API_URL = "https://v37ebk984n0v6q97.aistudio-app.com/ocr";
const DEFAULT_TOKEN = "483605608bc2d69ed9979463871dd4bc6095285a";

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

        const body = await req.json();
        const { image } = body; // Base64 image

        // 1. Get Settings from DB
        let token = body.token || process.env.PADDLE_OCR_TOKEN || process.env.BAIDU_OCR_API_KEY;
        let apiUrl = body.apiUrl || PADDLE_API_URL;

        const { data: settings } = await supabase
            .from('system_settings')
            .select('*')
            .or('key.eq.ocr_config_paddle,key.eq.ocr_url,key.eq.ocr_token');

        if (settings) {
            const map: Record<string, string> = {};
            settings.forEach((s: any) => map[s.key] = s.value);

            let preferredConfig: any = null;
            if (map['ocr_config_paddle']) {
                try {
                    preferredConfig = JSON.parse(map['ocr_config_paddle']);
                } catch (e) { console.error("Could not parse preferred config:", e); }
            }

            if (preferredConfig?.apiUrl) {
                apiUrl = preferredConfig.apiUrl;
            } else if (map['ocr_url'] && !body.apiUrl) {
                // For standard endpoint, only use generic ocr_url if it doesn't look like layout
                if (!map['ocr_url'].includes('layout')) {
                    apiUrl = map['ocr_url'];
                }
            }

            if (!body.token) {
                if (preferredConfig?.token) {
                    token = preferredConfig.token;
                } else if (map['ocr_token']) {
                    token = map['ocr_token'];
                }
            }
        }

        if (!token) token = DEFAULT_TOKEN;
        if (!image) return NextResponse.json({ error: "No image provided" }, { status: 400 });

        const cleanImage = image.replace(/^data:image\/\w+;base64,/, "");

        // 2. Prepare Payload (Tuned for Handwriting)
        const payload: any = {
            file: cleanImage,
            fileType: 1,
            // Disable orientation/warping to prevent handwriting being "rectified" incorrectly
            useDocOrientationClassify: false,
            useDocUnwarping: false,
            useTextlineOrientation: false,
            // Increase sensitivity for thin handwriting strokes
            text_det_params: {
                thresh: 0.1,
                box_thresh: 0.2,
                unclip_ratio: 2.0 // Slightly higher to capture stroke ends
            }
        };

        // 3. Call External API
        console.log("Calling Standard OCR API (Handwriting Optimized):", apiUrl);
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
            if (response.status === 429) {
                return NextResponse.json({ error: "OCR Quota Exceeded (429)." }, { status: 429 });
            }
            throw new Error(`OCR API Error: ${response.status} ${errText.substring(0, 100)}`);
        }

        const result = await response.json();

        if ((result.errorCode !== undefined && result.errorCode !== 0) ||
            (result.error_code !== undefined && result.error_code !== 0)) {
            throw new Error(result.errorMsg || result.error_msg || "Unknown Error");
        }

        // 4. Parse Response (Standard OCR only)
        if (result.result && result.result.ocrResults) {
            const ocrResults = result.result.ocrResults;
            // Join all standard word blocks
            const text = ocrResults.map((r: any) => {
                if (typeof r.prunedResult === 'string') return r.prunedResult;
                if (r.prunedResult && r.prunedResult.text) return r.prunedResult.text;
                if (r.prunedResult && Array.isArray(r.prunedResult.rec_texts)) return r.prunedResult.rec_texts.join(" ");
                return r.words || r.text || "";
            }).join("\n");

            return NextResponse.json({ text: text.trim(), debug: result });
        }

        return NextResponse.json({ text: "", debug: result });

    } catch (error: any) {
        console.error("Standard OCR Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
