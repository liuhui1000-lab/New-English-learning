
// Stitched Image Result Interface
export interface StitchedImageResult {
    dataUrl: string;
    // Map of Question ID -> Vertical Y-Range in the stitched image
    // Used to map OCR text blocks back to questions
    rects: Record<string, { startY: number, endY: number }>;
}

/**
 * Stitches multiple images vertically into a single image.
 * Returns the data URL and a map of coordinates.
 */
export const stitchImages = (images: { id: string, dataUrl: string }[]): Promise<StitchedImageResult> => {
    return new Promise((resolve, reject) => {
        if (images.length === 0) {
            reject(new Error("No images to stitch"));
            return;
        }

        const loadedImages: HTMLImageElement[] = [];
        let loadedCount = 0;

        // 1. Load all images first
        images.forEach((item, index) => {
            const img = new Image();
            img.src = item.dataUrl;
            img.onload = () => {
                loadedImages[index] = img; // Keep order
                loadedCount++;
                if (loadedCount === images.length) {
                    processStitching();
                }
            };
            img.onerror = () => {
                reject(new Error(`Failed to load image for ${item.id}`));
            };
        });

        const processStitching = () => {
            try {
                // 2. Calculate dimensions
                // Reduced from 1024 to avoid payload limits (Vercel 4.5MB)
                const maxWidth = 800; // Optimal for handwriting without exceeding limits
                let totalHeight = 0;
                const padding = 100; // INCREASED padding to force separation
                const separatorHeight = 2; // Height of the visual separator line

                const rects: Record<string, { startY: number, endY: number }> = {};

                // First pass: Calculate total height and store expected Y ranges
                let currentY = 0;

                loadedImages.forEach((img, i) => {
                    const originalItem = images[i];

                    // Scale image to fit width (or scale up if smaller)
                    const scale = maxWidth / img.width;
                    const scaledHeight = img.height * scale;

                    // We define the "Region" for this question as:
                    // From currentY to currentY + scaledHeight + padding
                    // This includes the gap after the image, catching any overflow text
                    const startY = currentY;
                    const endY = currentY + scaledHeight + padding + separatorHeight;

                    rects[originalItem.id] = { startY, endY };

                    totalHeight = endY; // Update total height
                    currentY = endY;
                });

                // 3. Create Canvas
                const canvas = document.createElement('canvas');
                canvas.width = maxWidth;
                canvas.height = totalHeight;
                const ctx = canvas.getContext('2d');

                if (!ctx) {
                    reject(new Error("Failed to get stitching canvas context"));
                    return;
                }

                // Fill white background (Optimal for OCR)
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // 4. Draw Images (CLEAN - NO MARKERS)
                // We rely entirely on the Y-coordinates to map back.

                Object.entries(rects).forEach(([id, rect], i) => {
                    // Find the image
                    // Note: rects iteration order matches insertion order in JS, 
                    // but safer to use loadedImages index.
                    const img = loadedImages[i];


                    // Draw Image (Scaled) at startY
                    const scale = maxWidth / img.width;
                    const scaledHeight = img.height * scale;

                    // Enable high quality scaling
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';

                    ctx.drawImage(img, 0, rect.startY, maxWidth, scaledHeight);

                    // Draw a faint separator line to force OCR layout splitting
                    // But make it faint enough so it doesn't get read as text (underscore)?
                    // Actually, a gap is usually better, but if it merges, we need a "wall".
                    // Let's draw a light gray line at the bottom of the padding area.

                    const lineY = rect.endY - (padding / 2);
                    ctx.beginPath();
                    ctx.moveTo(0, lineY);
                    ctx.lineTo(maxWidth, lineY);
                    ctx.strokeStyle = "#E0E0E0"; // Light gray
                    ctx.lineWidth = 2;
                    ctx.stroke();

                    // --- NEW: Draw Visual Anchor ---
                    // Draw a clear text marker like "#1:" to the left
                    // This creates a "Smart Anchor" for the OCR to find.
                    ctx.fillStyle = "#A0A0A0"; // Medium gray (readable but not heavy)
                    ctx.font = "bold 24px Arial";
                    ctx.textAlign = "left";
                    ctx.textBaseline = "top";
                    // Offset slightly from left and top
                    ctx.fillText(`#${i + 1}:`, 10, rect.startY + 10);
                    // -----------------------------
                });

                // 5. Export Stitched Image
                // Standard Quality JPEG (0.8) - Adequate for OCR
                const resultDataUrl = canvas.toDataURL('image/jpeg', 0.8);
                resolve({ dataUrl: resultDataUrl, rects });

            } catch (error) {
                reject(error);
            }
        };
    });
};

/**
 * Parses OCR result based on COORDINATES (Bounding Boxes).
 * Uses the pre-calculated question regions to assign text blocks.
 * 
 * @param ocrDebugResult The full 'debug' object returned by the API (contains 'result' > 'ocrResults')
 * @param rects The mapping of ID -> {startY, endY}
 */
export const parseStitchedOCRResult = (
    ocrDebugResult: any,
    rects: Record<string, { startY: number, endY: number }>
): Record<string, string> => {
    const results: Record<string, string[]> = {};

    // Initialize empty arrays
    Object.keys(rects).forEach(id => results[id] = []);

    if (!ocrDebugResult || !ocrDebugResult.result) {
        console.warn("parseStitchedOCRResult: No result found in debug info", ocrDebugResult);
        return {};
    }

    // Helper: Get center Y of a block
    const getBlockCenterY = (block: any): number => {
        // 1. Try 'points' (Polygon: [[x1,y1], [x2,y2], [x3,y3], [x4,y4]])
        if (block.points && Array.isArray(block.points) && block.points.length > 0) {
            const sumY = block.points.reduce((sum: number, p: number[]) => sum + p[1], 0);
            return sumY / block.points.length;
        }

        // 2. Try 'block_bbox' (Layout: [x, y, w, h])
        if (block.block_bbox && Array.isArray(block.block_bbox) && block.block_bbox.length === 4) {
            return block.block_bbox[1] + (block.block_bbox[3] / 2);
        }

        // 3. Try 'box' (Some OCR formats: [x, y, w, h] or similar)
        if (block.box && Array.isArray(block.box) && block.box.length === 4) {
            return block.box[1] + (block.box[3] / 2);
        }

        return -1;
    };

    // Helper: Get text from block
    const getBlockText = (block: any): string => {
        return block.prunedResult || block.text || block.words || block.block_content || "";
    };

    // Gather all potential text blocks
    let blocks: any[] = [];

    // Priority 1: 'ocrResults' (High Precision Text Lines)
    if (ocrDebugResult.result.ocrResults && Array.isArray(ocrDebugResult.result.ocrResults)) {
        blocks = ocrDebugResult.result.ocrResults;
    }
    // Priority 2: 'layoutParsingResults' (If OCR text is empty/missing, try layout blocks)
    else if (ocrDebugResult.result.layoutParsingResults && Array.isArray(ocrDebugResult.result.layoutParsingResults)) {
        // Flatten layout results, looking into prunedResult if present
        blocks = ocrDebugResult.result.layoutParsingResults.flatMap((l: any) => {
            // Check nested structure seen in logs: l.prunedResult.parsing_res_list
            if (l.prunedResult && l.prunedResult.parsing_res_list) {
                return l.prunedResult.parsing_res_list;
            }
            return l.parsing_res_list || [l];
        });
    }

    // Process blocks
    blocks.forEach((block: any) => {
        let text = getBlockText(block);

        // Ensure text is definitely a string to avoid .trim() errors
        if (typeof text !== 'string') {
            if (text && (text as any).toString) {
                text = (text as any).toString();
            } else {
                text = "";
            }
        }

        const centerY = getBlockCenterY(block);

        if (!text || !text.trim()) return;

        // --- NEW: Anchor Detection Logic ---
        // Search for all anchor patterns like "#1:" or "#2:" within the text
        // Use global regex to handle cases where OCR merges multiple segments
        const anchorRegex = /#\s*(\d+)\s*[:：]/g;
        const matches = Array.from(text.matchAll(anchorRegex));

        if (matches.length > 0) {
            const questionIds = Object.keys(rects);
            console.log(`Found ${matches.length} anchors in single block: "${text}"`);

            for (let i = 0; i < matches.length; i++) {
                const match = matches[i];
                const index = parseInt(match[1]);
                const nextMatch = matches[i + 1];

                // Content for this anchor starts after the current match 
                // and ends before the next anchor (or end of block)
                const startPos = match.index! + match[0].length;
                const endPos = nextMatch ? nextMatch.index : text.length;
                const snippet = text.substring(startPos, endPos).trim();

                const targetId = questionIds[index - 1];
                if (targetId && snippet) {
                    console.log(`Mapped Anchor #${index} -> Snippet: "${snippet}"`);
                    results[targetId].push(snippet);
                }
            }
            return; // Priority Match - skip coordinate logic
        }
        // ------------------------------------

        // NEW: Handle Merged Blocks (e.g. "A\nB") spanning multiple questions
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);

        if (lines.length > 1) {
            // Calculate block height relative to lines
            let blockHeight = 0;
            let blockTop = 0;

            if (block.block_bbox && block.block_bbox.length === 4) {
                blockTop = block.block_bbox[1];
                blockHeight = block.block_bbox[3];
            } else if (block.box && block.box.length === 4) {
                blockTop = block.box[1];
                blockHeight = block.box[3]; // format usually [x, y, w, h] or similar
            } else if (block.points && block.points.length > 0) {
                // rough min/max Y
                const ys = block.points.map((p: any) => p[1]);
                const minY = Math.min(...ys);
                const maxY = Math.max(...ys);
                blockTop = minY;
                blockHeight = maxY - minY;
            }

            // If we have valid height info, interpolate line positions
            if (blockHeight > 0) {
                const step = blockHeight / lines.length;
                lines.forEach((lineText, index) => {
                    // Estimate center Y for this line
                    const lineCenterY = blockTop + (index * step) + (step / 2);
                    console.log(`Interpolated Line: "${lineText}" at Y=${lineCenterY} (Block: ${blockTop}-${blockTop + blockHeight})`);

                    for (const [id, rect] of Object.entries(rects)) {
                        if (lineCenterY >= rect.startY && lineCenterY < rect.endY) {
                            results[id].push(lineText);
                            break;
                        }
                    }
                });
                return; // Managed lines individually
            }
        }

        // Standard Single Block Logic (if not split or no height info)
        if (centerY >= 0) {
            // Find valid region
            for (const [id, rect] of Object.entries(rects)) {
                if (centerY >= rect.startY && centerY < rect.endY) {
                    // If it was a multi-line block but we couldn't split by height, 
                    // we might just dump it all in one? Risky.
                    // Better to invoke the splitter if lines > 1 regardless?
                    // But we did invoke it above. If here, likely single line.
                    results[id].push(text);
                    break; // Belongs to only one question
                }
            }
        }
    });

    // Join lines for each question
    const final: Record<string, string> = {};
    Object.entries(results).forEach(([id, lines]) => {
        const combined = lines.join(" ").trim();
        // Basic cleanup
        const cleaned = combined
            .replace(/<[^>]+>/g, '') // Strip HTML tags just in case
            .replace(/_{3,}/g, '')   // Remove long underscores
            .trim();

        if (cleaned) {
            final[id] = cleaned;
        }
    });

    console.log("Coordinate-Based Parsing Result:", final);
    return final;
};
