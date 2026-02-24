import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60; // PDF processing can take longer

// Helper: Create admin client (service_role, bypasses RLS) for backend-only settings access
function createAdminClient(fallbackClient: any) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
        console.warn("Missing Supabase Admin credentials, falling back to standard client")
        return fallbackClient
    }

    return createClient(url, key)
}

// Configuration for Paddle OCR Layout Parsing
const PADDLE_LAYOUT_API_URL = "https://42g0y668o7v230je.aistudio-app.com/layout-parsing";
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
        .replace(/\|{3,}/g, ' ')
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

        const body = await req.json();
        const { image } = body; // Base64 image

        // 1. Get Settings from DB
        let token = body.token || process.env.PADDLE_OCR_TOKEN || process.env.BAIDU_OCR_API_KEY;
        let apiUrl = body.apiUrl || PADDLE_LAYOUT_API_URL;

        // Use service role to bypass RLS so students can still trigger API calls using admin settings
        const adminClient = createAdminClient(supabase)
        const { data: settings } = await adminClient
            .from('system_settings')
            .select('*')
            .or('key.eq.ocr_config_paddle_layout,key.eq.ocr_url,key.eq.ocr_token');

        if (settings) {
            const map: Record<string, string> = {};
            settings.forEach((s: any) => map[s.key] = s.value);

            let preferredConfig: any = null;
            if (map['ocr_config_paddle_layout']) {
                try {
                    preferredConfig = JSON.parse(map['ocr_config_paddle_layout']);
                } catch (e) { console.error("Could not parse preferred config:", e); }
            }

            if (preferredConfig?.apiUrl) {
                apiUrl = preferredConfig.apiUrl;
            } else if (map['ocr_url'] && !body.apiUrl) {
                // Layout endpoint is specific, don't fallback to generic ocr_url if it might be standard OCR
                // Only fallback if the ocr_url explicitly looks like a layout endpoint or if no preferredConfig
                if (map['ocr_url'].includes('layout')) {
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

        // 2. Prepare Payload for Layout Parsing
        const payload: any = {
            file: cleanImage,
            fileType: 1,
            use_layout_detection: true,
            useLayoutDetection: true,
            merge_layout_blocks: false,
            mergeLayoutBlocks: false,
            use_ocr_for_image_block: true,
            useDocOrientationClassify: false,
            useDocUnwarping: false,
            useChartRecognition: false
        };

        // 3. Call External API
        console.log("Calling Layout OCR API:", apiUrl);
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
            throw new Error(`Paddle Layout API Error: ${response.status} ${errText.substring(0, 100)}`);
        }

        const result = await response.json();

        if ((result.errorCode !== undefined && result.errorCode !== 0) ||
            (result.error_code !== undefined && result.error_code !== 0)) {
            throw new Error(result.errorMsg || result.error_msg || "Unknown Error");
        }

        // 4. Parse Response (Layout Specific Logic)

        // Priority 1: Layout Parsing (Markdown)
        if (result.result && result.result.layoutParsingResults) {
            const parsingResults = result.result.layoutParsingResults;
            let fullMarkdown = "";

            for (const res of parsingResults) {
                if (res.markdown && res.markdown.text) {
                    fullMarkdown += res.markdown.text + "\n\n";
                }
            }

            const cleanedText = cleanOCRText(fullMarkdown);
            if (cleanedText && cleanedText.length > 5) {
                return NextResponse.json({ text: cleanedText, debug: result });
            }
        }

        // Priority 2: Standard OCR with spatial reconstruction (Reconstruct blanks from Layout Bounding Boxes)
        if (result.result && result.result.ocrResults) {
            const ocrResults = result.result.ocrResults;
            let rawBlocks: any[] = [];

            if (ocrResults.length === 1 && ocrResults[0].prunedResult && Array.isArray(ocrResults[0].prunedResult.dt_polys)) {
                const polys = ocrResults[0].prunedResult.dt_polys;
                const texts = ocrResults[0].prunedResult.rec_texts;
                for (let i = 0; i < Math.min(polys.length, texts.length); i++) {
                    rawBlocks.push({ text: texts[i], region: polys[i] });
                }
            } else {
                rawBlocks = ocrResults;
            }

            const blocks = rawBlocks.map((r: any) => {
                let text = r.text || (r.prunedResult && (typeof r.prunedResult === 'string' ? r.prunedResult : (r.prunedResult.text || r.prunedResult.rec_texts?.join(" ")))) || r.words || "";
                const region = r.region || r.textRegion || r.text_region || r.box || r.poly || r.points || r.location;

                let x = 0, y = 0, width = 0, height = 0;
                if (Array.isArray(region) && region.length === 4 && Array.isArray(region[0])) {
                    x = region[0][0]; y = region[0][1];
                    width = region[1][0] - region[0][0];
                    height = region[2][1] - region[0][1];
                    if (height < 0) height = region[3][1] - region[0][1];
                } else if (Array.isArray(region) && region.length === 4 && !Array.isArray(region[0])) {
                    x = region[0]; y = region[1]; width = region[2]; height = region[3];
                }

                return { text, x, y, width: Math.abs(width), height: Math.abs(height), bottom: y + Math.abs(height), right: x + Math.abs(width) };
            }).filter((b: any) => b.text && b.text.trim() !== "");

            if (blocks.length > 0) {
                blocks.sort((a: any, b: any) => {
                    const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
                    const minHeight = Math.min(a.height, b.height);
                    if (overlapY > minHeight * 0.5) return a.x - b.x;
                    return a.y - b.y;
                });

                const minX = Math.min(...blocks.map((b: any) => b.x));
                let processedLines: string[] = [];
                let currentLineStr = "";
                let currentLineY = -1;
                let currentLineHeight = -1;
                let lastBlockRight = -1;
                let debugLogs: string[] = [];

                blocks.forEach((b: any, index: number) => {
                    const overlapY = currentLineY === -1 ? 0 : Math.max(0, Math.min(b.bottom, currentLineY + currentLineHeight) - Math.max(b.y, currentLineY));
                    const isSameLine = currentLineY !== -1 && overlapY > Math.min(b.height, currentLineHeight) * 0.5;
                    const avgCharWidth = Math.max(1, b.width / Math.max(1, b.text.length));

                    if (!isSameLine) {
                        if (currentLineStr) processedLines.push(currentLineStr);
                        const leadingGap = b.x - minX;
                        if (leadingGap > avgCharWidth * 3.5 && leadingGap > 25 && !/^[A-G][\.\)）]/.test(b.text.trim())) {
                            currentLineStr = `____ ${b.text}`;
                        } else {
                            currentLineStr = b.text;
                        }
                        currentLineY = b.y;
                        currentLineHeight = b.height;
                        lastBlockRight = b.right;
                    } else {
                        const gap = b.x - lastBlockRight;
                        const isOptionBlock = /^[A-G]([\.\)）]\s*)?$/.test(b.text.trim()) || b.text.trim() === "A" || b.text.trim() === "B";
                        if (gap > avgCharWidth * 2.5 && gap > 15 && !isOptionBlock) {
                            currentLineStr += ` ____ ${b.text}`;
                        } else {
                            currentLineStr += ` ${b.text}`;
                        }
                        lastBlockRight = b.right;
                        currentLineHeight = Math.max(currentLineHeight, b.height);
                    }
                });
                if (currentLineStr) processedLines.push(currentLineStr);

                return NextResponse.json({
                    text: cleanOCRText(processedLines.join("\n")),
                    debug: result,
                    layoutMetrics: debugLogs
                });
            }
        }

        return NextResponse.json({ text: "", debug: result });

    } catch (error: any) {
        console.error("Layout OCR Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
