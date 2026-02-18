import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const maxDuration = 60; // Allow up to 60 seconds for OCR processing

// Configuration for Paddle OCR (Official OCR Endpoint)
const PADDLE_API_URL = "https://42g0y668o7v230je.aistudio-app.com/ocr";
// Default token provided by user
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
        // Remove HTML tags (div, img, figure, table, tr, td, etc.)
        .replace(/<\/?(?:div|img|figure|span|p|table|tbody|thead|tr|td|th)[^>]*>/gi, ' ')
        // Remove known table artifact strings that might remain
        .replace(/(?:\||___){3,}/g, ' ')
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
            const map: Record<string, string> = {};
            settings.forEach((s: any) => map[s.key] = s.value);

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

        // Ensure clean base64 (strip data:image/...;base64, prefix if present)
        const cleanImage = image.replace(/^data:image\/\w+;base64,/, "");

        // 2. Prepare Payload (Match Official Spec)
        // For images, fileType should be 1
        const payload = {
            file: cleanImage,
            fileType: 1,
            useDocOrientationClassify: false,
            useDocUnwarping: false,
            useTextlineOrientation: false, // Replaced useChartRecognition with official param
            // Force OCR on content detected as "Image" (e.g. single letters)
            useOcrForImageBlock: true,
            use_ocr_for_image_block: true, // Try both casings just in case
            useLayoutDetection: false, // Maybe try disable layout detection? 
            use_layout_detection: false
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

        if (result.result) {
            console.log("OCR Result Keys:", Object.keys(result.result));
            if (result.result.ocrResults) console.log("Has ocrResults:", result.result.ocrResults.length);
            if (result.result.layoutParsingResults) console.log("Has layoutParsingResults:", result.result.layoutParsingResults.length);
            // Log model info if present (e.g. algo_version)
            if (result.result.algo_version) console.log("OCR Algo Version:", result.result.algo_version);

            // DEBUG: Print the raw ocrResults to see what's happening
            if (result.result.ocrResults) {
                console.log("Raw OCR Results:", JSON.stringify(result.result.ocrResults.slice(0, 3)));
            }
        }

        // 4. Parse Response

        // Priority 1: Check for Stitched Batch Content (Raw OCR Text)
        if (result.result && result.result.ocrResults) {
            const ocrResults = result.result.ocrResults;
            // Support 'prunedResult' (official API) as well as 'words'/'text' fallbacks.
            const rawText = ocrResults.map((r: any) => r.prunedResult || r.words || r.text || "").join("\n");

            if (rawText.includes("[[ID:")) {
                console.log("Detected Stitched Batch Content, using raw OCR results.");
                const cleanedText = cleanOCRText(rawText);
                return NextResponse.json({ text: cleanedText, debug: result });
            }
        }

        // Priority 2: Layout Parsing (Markdown) - If available (unlikely in pure OCR endpoint)
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

            // Only return if we actually found text. 
            if (cleanedText && cleanedText.length > 0) {
                return NextResponse.json({ text: cleanedText, debug: result });
            }
            console.log("Layout Parsing returned empty. Falling back to Raw OCR...");
        }

        // Priority 3: Standard OCR (Plain Text) from 'ocrResults'
        // This is the primary path for the new 'ocr' endpoint.
        if (result.result && result.result.ocrResults) {
            const ocrResults = result.result.ocrResults;
            const text = ocrResults.map((r: any) => {
                // IMPORTANT: The API might return text in different fields.
                // Standard: prunedResult
                // Layout: text
                // Others: words
                const val = r.prunedResult || r.words || r.text || "";
                return val;
            }).join("\n");

            const cleanedText = cleanOCRText(text);

            // Return debug info in the response so client can see it
            return NextResponse.json({ text: cleanedText, debug: result });
        }

        // Priority 4: Handle "No Content Found" gracefully
        // If we reached here, it means the API call was valid but no text blocks were returned.
        console.warn("OCR found no text content (layout or raw). Returning empty string.");
        return NextResponse.json({ text: "", debug: result });

    } catch (error: any) {
        console.error("OCR Proxy Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
