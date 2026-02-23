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
            // Official API Params (Minimal Set)
            useDocOrientationClassify: false,
            useDocUnwarping: false,
            useTextlineOrientation: false,
            // Force OCR on content incorrectly detected as "image"
            use_ocr_for_image_block: true,
            useOcrForImageBlock: true, // Try both casings
            // Enable layout detection to extract LaTeX underlines and structural markdown
            use_layout_detection: true,
            useLayoutDetection: true, // Try both casings
            // Try both casings
            // CRITICAL: Disable block merging to get separate results for close lines
            merge_layout_blocks: false,
            mergeLayoutBlocks: false,
            // Lower detection thresholds for single letters (like 'C') which have low confidence
            text_det_params: {
                box_thresh: 0.1,    // Lower from default 0.6
                thresh: 0.1         // Lower from default 0.3
            }
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
        if (result.result && result.result.ocrResults) {
            const ocrResults = result.result.ocrResults;

            // Advanced Algorithm: Reconstruct blanks from Layout Bounding Boxes
            // PaddleOCR often returns textRegion array: [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
            let processedLines: string[] = [];

            // Try spatial reconstruction first if textRegion data is robust
            if (ocrResults.length > 0 && ocrResults[0].textRegion) {
                // Map to simpler geometric objects
                const blocks = ocrResults.map((r: any) => {
                    let text = r.prunedResult || r.words || r.text || "";
                    if (typeof text === 'object' && text !== null) {
                        text = Array.isArray(text.rec_texts) ? text.rec_texts.join(" ") : (text.text || text.word || text.words || "");
                        if (typeof text === 'object') text = JSON.stringify(text); // Fallback
                    }

                    const region = r.textRegion;
                    // region[0] is top-left [x, y], region[2] is bottom-right [x, y] OR region is [x, y, w, h] depending on API output.
                    // Assuming typical 4-point array: [[x1,y1], [x2,y1], [x3,y2], [x4,y2]]
                    let x = 0, y = 0, width = 0, height = 0;
                    if (Array.isArray(region) && region.length === 4 && Array.isArray(region[0])) {
                        x = region[0][0];
                        y = region[0][1];
                        width = region[1][0] - region[0][0];
                        height = region[2][1] - region[1][1];
                    } else if (Array.isArray(region) && region.length === 4 && !Array.isArray(region[0])) {
                        x = region[0]; y = region[1]; width = region[2]; height = region[3];
                    }

                    return { text, x, y, width, height, bottom: y + height, right: x + width };
                }).filter((b: any) => b.text.trim() !== "");

                // Sort blocks strictly vertically, then horizontally
                blocks.sort((a: any, b: any) => {
                    // If vertical overlap (i.e. on the same line) > 50%
                    const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
                    const minHeight = Math.min(a.height, b.height);
                    if (overlapY > minHeight * 0.5) {
                        return a.x - b.x; // same line, sort left to right
                    }
                    return a.y - b.y; // different lines, sort top to bottom
                });

                // Reconstruct lines with gap detection
                let currentLineStr = "";
                let currentLineY = -1;
                let currentLineHeight = -1;
                let lastBlockRight = -1;

                blocks.forEach((b: any, index: number) => {
                    // Check if it's a new line
                    const overlapY = currentLineY === -1 ? 0 : Math.max(0, Math.min(b.bottom, currentLineY + currentLineHeight) - Math.max(b.y, currentLineY));
                    const isSameLine = currentLineY !== -1 && overlapY > Math.min(b.height, currentLineHeight) * 0.5;

                    if (!isSameLine) {
                        if (currentLineStr) processedLines.push(currentLineStr);
                        currentLineStr = b.text;
                        currentLineY = b.y;
                        currentLineHeight = b.height;
                        lastBlockRight = b.right;
                    } else {
                        // Same line! Check distance between blocks.
                        // Calculate average char width of current block as heuristic
                        const avgCharWidth = b.width / Math.max(1, b.text.length);
                        const gap = b.x - lastBlockRight;

                        // If gap is unusually large (e.g. > 3 average characters), assume an underline was stripped
                        if (gap > avgCharWidth * 3 && gap > 15) { // 15px minimum absolute threshold to ignore standard kerning
                            currentLineStr += ` ____ ${b.text}`;
                        } else {
                            // Standard space
                            currentLineStr += ` ${b.text}`;
                        }

                        lastBlockRight = b.right;
                        // update currentLineHeight to max of line
                        currentLineHeight = Math.max(currentLineHeight, b.height);
                    }
                });
                if (currentLineStr) processedLines.push(currentLineStr);

            } else {
                // VERY Fallback if no geometry data
                processedLines = ocrResults.map((r: any) => {
                    let val = r.prunedResult || r.words || r.text || "";
                    if (typeof val === 'object' && val !== null) {
                        if (Array.isArray(val.rec_texts)) val = val.rec_texts.join(" ");
                        else val = val.text || val.word || val.words || "";
                        if (typeof val === 'object') val = JSON.stringify(val);
                    }
                    return val;
                });
            }

            const text = processedLines.join("\n");

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
