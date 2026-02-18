
// Mock logic from imageStitcher.ts to test parsing
const parseStitchedOCRResult = (ocrDebugResult, rects) => {
    const results = {};
    Object.keys(rects).forEach(id => results[id] = []);

    if (!ocrDebugResult || !ocrDebugResult.result) {
        console.warn("parseStitchedOCRResult: No result found in debug info");
        return {};
    }

    const getBlockCenterY = (block) => {
        // 1. Try 'points'
        if (block.points && Array.isArray(block.points) && block.points.length > 0) {
            const sumY = block.points.reduce((sum, p) => sum + p[1], 0);
            return sumY / block.points.length;
        }
        // 2. Try 'block_bbox'
        if (block.block_bbox && Array.isArray(block.block_bbox) && block.block_bbox.length === 4) {
            return block.block_bbox[1] + (block.block_bbox[3] / 2);
        }
        // 3. Try 'box'
        if (block.box && Array.isArray(block.box) && block.box.length === 4) {
            return block.box[1] + (block.box[3] / 2);
        }
        return -1;
    };

    const getBlockText = (block) => {
        return block.prunedResult || block.text || block.words || block.block_content || "";
    };

    let blocks = [];
    if (ocrDebugResult.result.ocrResults) {
        // BUG POTENTIAL: ocrResults might be nested or direct?
        // User log says: "Has ocrResults: 1"
        // Let's check structure from previous log in user message
        blocks = ocrDebugResult.result.ocrResults;
    } else if (ocrDebugResult.result.layoutParsingResults) {
        const layout = ocrDebugResult.result.layoutParsingResults;
        blocks = layout.flatMap(l => l.parsing_res_list || [l]);
    }

    console.log(`Found ${blocks.length} blocks to process`);

    blocks.forEach(block => {
        // Handle weird structure where prunedResult is the object but it contains the data?
        // Check user log: ocrResults[0] -> prunedResult -> parsing_res_list?
        // Wait, user log shows: 
        // "ocrResults": [ { "prunedResult": { "parsing_res_list": [...] } } ]

        // If block has 'prunedResult' and that prunedResult has 'parsing_res_list', we need to dig deeper!
        // The current code expects block ITSELF to have points/box/text.

        let subBlocks = [block];
        if (block.prunedResult && block.prunedResult.parsing_res_list) {
            subBlocks = block.prunedResult.parsing_res_list;
            console.log("Unwrapped prunedResult.parsing_res_list", subBlocks.length);
        } else if (block.parsing_res_list) {
            subBlocks = block.parsing_res_list;
        }

        subBlocks.forEach(sub => {
            const centerY = getBlockCenterY(sub);
            const text = getBlockText(sub);
            console.log(`Block text: "${text}", CenterY: ${centerY}`);

            if (centerY >= 0 && text && text.trim()) {
                for (const [id, rect] of Object.entries(rects)) {
                    if (centerY >= rect.startY && centerY < rect.endY) {
                        results[id].push(text);
                        break;
                    }
                }
            }
        });
    });

    const final = {};
    Object.entries(results).forEach(([id, lines]) => {
        const combined = lines.join(" ").trim();
        if (combined) final[id] = combined;
    });
    return final;
};

// Mock Data from User Log
const mockDebug = {
    "result": {
        "layoutParsingResults": [
            {
                "prunedResult": {
                    "page_count": null,
                    "width": 800,
                    "height": 1306,
                    "parsing_res_list": [
                        {
                            "block_label": "ocr",
                            "block_content": "A\nB\nC",
                            "block_bbox": [0, 0, 800, 1306] // The whole page!
                        }
                        // WAIT! The OCR returned "A\nB\nC" as ONE block because I removed the separators?
                        // And because they are close together?
                        // If they are one block, centerY will be in the middle of the whole image (653).
                        // That might map to a specific question (Question 2 or 3) or NONE if it spans multiple.
                        // But if it maps to ONE question, then ALL answers go to that question.

                        // PROBLEM: Mismatched granularity.
                        // We need OCR to detect them as SEPARATE lines.
                        // Or we need to parse the single block by lines and map line-by-line Y coordinates?
                        // But the API only gives bounding box for the WHOLE block if it merged them.
                    ]
                }
            }
        ]
    }
};

// Mock Rects (5 questions)
// Image 800x1306
// Approx 5 questions -> ~260px height each?
const mockRects = {
    "q1": { startY: 0, endY: 200 },
    "q2": { startY: 260, endY: 460 },
    "q3": { startY: 520, endY: 720 },
    "q4": { startY: 780, endY: 980 },
    "q5": { startY: 1040, endY: 1240 }
};

const res = parseStitchedOCRResult(mockDebug, mockRects);
console.log("Result:", res);
