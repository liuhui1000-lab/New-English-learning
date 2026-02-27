import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30; // Standard OCR is usually fast

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

        // Use service role to bypass RLS so students can still trigger API calls using admin settings
        const adminClient = createAdminClient(supabase)
        const { data: settings } = await adminClient
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
                // If there's NO specific handwriting config but there IS a global url,
                // Make sure we DO NOT accidentally use the powerful Layout/VL model for standard handwriting OCR,
                // because the VL models tend to strip strokes or treat them as images.
                const fallbackUrl = map['ocr_url'].toLowerCase();
                if (!fallbackUrl.includes('layout') && !fallbackUrl.includes('vl-15')) {
                    apiUrl = map['ocr_url'];
                } else {
                    console.log("Ignored global ocr_url because it looks like a Layout/VL endpoint. Falling back to default Handwriting endpoint.");
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

        // 2. Prepare Payload (Shotgun Approach for Sensitivity)
        // We use all known parameter variations to ensure the backend respects our request
        const payload: any = {
            file: cleanImage,
            fileType: 1,
            // Direction/Orientation settings
            useDocOrientationClassify: false,
            useDocUnwarping: false,
            useTextlineOrientation: false,
            use_direction_classify: false, // Variant

            // Disable Layout Features to force raw OCR
            use_layout_detection: false,
            useLayoutDetection: false,
            use_seal_recognition: false,
            use_chart_recognition: false,
            use_ocr_for_image_block: true,

            // Detection sensitivity (Shotgun v3)
            thresh: 0.1,
            det_thresh: 0.1,
            box_thresh: 0.1,
            det_db_thresh: 0.05, // Extra low
            det_db_box_thresh: 0.1,
            det_db_unclip_ratio: 2.2,
            det_limit_side_len: 1280,
            limit_side_len: 1280,

            // Nested structure variations
            text_det_params: {
                thresh: 0.1,
                box_thresh: 0.1,
                limit_side_len: 1280,
                unclip_ratio: 2.2,
                det_db_thresh: 0.05,
                det_db_box_thresh: 0.1
            },
            data: {
                // Some wrappers expect params inside a 'data' block
                thresh: 0.1,
                det_db_thresh: 0.05,
                det_limit_side_len: 1280,
                unclip_ratio: 2.2
            }
        };

        // 3. Call External API
        console.log("Calling Standard OCR API (Shotgun Params):", apiUrl);
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

        // 4. Robust Spatial Reconstruction (with logging)
        if (result.result && result.result.ocrResults) {
            const ocrResults = result.result.ocrResults;
            let rawBlocks: any[] = [];

            ocrResults.forEach((r: any) => {
                const pruned = r.prunedResult;

                // CASE 1: Flattened Multi-result
                if (pruned && Array.isArray(pruned.rec_texts)) {
                    pruned.rec_texts.forEach((text: string, i: number) => {
                        if (!text || text.trim() === "") return;

                        const region = (pruned.dt_polys?.[i]) || (pruned.rec_polys?.[i]) || (pruned.rec_boxes?.[i]);
                        if (region) {
                            let x = 0, y = 0, w = 0, h = 0;
                            if (Array.isArray(region)) {
                                if (Array.isArray(region[0])) {
                                    x = region[0][0]; y = region[0][1];
                                    w = Math.max(...region.map((p: any) => p[0])) - x;
                                    h = Math.max(...region.map((p: any) => p[1])) - y;
                                } else if (region.length === 4) {
                                    x = region[0]; y = region[1]; w = region[2]; h = region[3];
                                }
                            }
                            rawBlocks.push({
                                text: text.trim(),
                                x, y, width: Math.abs(w), height: Math.abs(h),
                                bottom: y + Math.abs(h), right: x + Math.abs(w)
                            });
                        }
                    });
                }
                // CASE 2: Nested/Standard result
                else {
                    const text = r.text || (pruned && (typeof pruned === 'string' ? pruned : (pruned.text || pruned.word))) || r.words || "";
                    const region = r.region || r.textRegion || r.box || r.poly;

                    if (text && text.trim() !== "" && region) {
                        let x = 0, y = 0, w = 0, h = 0;
                        if (Array.isArray(region) && Array.isArray(region[0])) {
                            x = region[0][0]; y = region[0][1];
                            w = Math.max(...region.map((p: any) => p[0])) - x;
                            h = Math.max(...region.map((p: any) => p[1])) - y;
                        } else if (Array.isArray(region) && region.length === 4) {
                            x = region[0]; y = region[1]; w = region[2]; h = region[3];
                        }
                        rawBlocks.push({
                            text: text.trim(),
                            x, y, width: Math.abs(w), height: Math.abs(h),
                            bottom: y + Math.abs(h), right: x + Math.abs(w)
                        });
                    }
                }
            });

            console.log("OCR Blocks detected:", rawBlocks.length);
            rawBlocks.forEach((b, i) => {
                console.log(`Block ${i}: "${b.text}" at (${b.x}, ${b.y}) w:${b.width} h:${b.height}`);
            });

            if (rawBlocks.length > 0) {
                // Sort blocks (Allow 50% overlap for line grouping)
                rawBlocks.sort((a, b) => {
                    const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
                    const minH = Math.min(a.height, b.height);
                    if (overlapY > minH * 0.5) return a.x - b.x;
                    return a.y - b.y;
                });

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
                        currentLineStr += " " + b.text;
                        currentLineHeight = Math.max(currentLineHeight, b.height);
                    }
                });
                if (currentLineStr) processedLines.push(currentLineStr);

                // For handwriting practice, usually it's one answer string
                const finalResult = processedLines.join("\n").replace(/\n/g, " ").replace(/\s+/g, " ");
                console.log("Final OCR Result:", finalResult);

                return NextResponse.json({ text: finalResult, debug: result });
            }
        }

        return NextResponse.json({ text: "", debug: result });

    } catch (error: any) {
        console.error("Standard OCR Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
