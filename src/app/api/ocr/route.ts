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

        // 2. Prepare Payload (Tuning for maximum sensitivity and scale)
        const payload: any = {
            file: cleanImage,
            fileType: 1,
            // Disable orientation/warping to prevent handwriting being "rectified" incorrectly
            useDocOrientationClassify: false,
            useDocUnwarping: false,
            useTextlineOrientation: false,
            // Redundant parameters to ensure sensitivity is applied across different backend wrappers
            det_db_thresh: 0.1,
            det_db_box_thresh: 0.2,
            det_limit_side_len: 2000,
            text_det_params: {
                thresh: 0.1,
                box_thresh: 0.2,
                limit_side_len: 2000,
                unclip_ratio: 2.0
            }
        };

        // 3. Call External API
        console.log("Calling Standard OCR API (Robust Reconstruction):", apiUrl);
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

        // 4. Robust Spatial Reconstruction
        if (result.result && result.result.ocrResults) {
            const ocrResults = result.result.ocrResults;

            // Extract raw blocks with coordinates
            let rawBlocks: any[] = [];
            ocrResults.forEach((r: any) => {
                const text = r.text || (r.prunedResult && (typeof r.prunedResult === 'string' ? r.prunedResult : (r.prunedResult.text || r.prunedResult.rec_texts?.join(" ")))) || r.words || "";
                const region = r.region || r.textRegion || r.text_region || r.box || r.poly || r.points || r.location;

                let x = 0, y = 0, width = 0, height = 0;
                if (Array.isArray(region) && region.length === 4 && Array.isArray(region[0])) {
                    // Coordinate array [[x,y], [x,y], [x,y], [x,y]]
                    x = region[0][0]; y = region[0][1];
                    width = region[1][0] - region[0][0];
                    height = region[2][1] - region[0][1];
                    if (height < 0) height = region[3][1] - region[0][1];
                } else if (Array.isArray(region) && region.length === 4 && !Array.isArray(region[0])) {
                    // Flat array [x, y, w, h]
                    x = region[0]; y = region[1]; width = region[2]; height = region[3];
                }

                if (text && text.trim() !== "") {
                    rawBlocks.push({
                        text: text.trim(),
                        x, y,
                        width: Math.abs(width),
                        height: Math.abs(height),
                        bottom: y + Math.abs(height),
                        right: x + Math.abs(width)
                    });
                }
            });

            if (rawBlocks.length > 0) {
                // Sort blocks: Primary Y (line grouping), Secondary X
                rawBlocks.sort((a, b) => {
                    const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
                    const minHeight = Math.min(a.height, b.height);
                    // If vertical overlap > 50%, treat as same line
                    if (overlapY > minHeight * 0.5) return a.x - b.x;
                    return a.y - b.y;
                });

                // Assemble lines
                let processedLines: string[] = [];
                let currentLineStr = "";
                let currentLineY = -1;
                let currentLineHeight = -1;

                rawBlocks.forEach((b) => {
                    const overlapY = currentLineY === -1 ? 0 : Math.max(0, Math.min(b.bottom, currentLineY + currentLineHeight) - Math.max(b.y, currentLineY));
                    const isSameLine = currentLineY !== -1 && overlapY > Math.min(b.height, currentLineHeight) * 0.5;

                    if (!isSameLine) {
                        if (currentLineStr) processedLines.push(currentLineStr);
                        currentLineStr = b.text;
                        currentLineY = b.y;
                        currentLineHeight = b.height;
                    } else {
                        // Handle horizontal gaps - very basic for standard OCR
                        currentLineStr += " " + b.text;
                        currentLineHeight = Math.max(currentLineHeight, b.height);
                    }
                });
                if (currentLineStr) processedLines.push(currentLineStr);

                return NextResponse.json({ text: processedLines.join("\n"), debug: result });
            }
        }

        return NextResponse.json({ text: "", debug: result });

    } catch (error: any) {
        console.error("Standard OCR Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
