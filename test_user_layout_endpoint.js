const fs = require('fs');

async function run() {
    try {
        const url = "https://5ejew8k4i019dek5.aistudio-app.com/layout-parsing";
        // User's token from their screenshot context or fallback to known good
        const token = "483605608bc2d69ed9979463871dd4bc6095285a";

        console.log("Downloading a test image...");
        const imgRes = await fetch("https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/release/2.6/doc/imgs_en/img_12.jpg");
        const arrayBuffer = await imgRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Image = buffer.toString('base64');

        const payload = {
            file: base64Image,
            fileType: 1, // Added to fix 422
            use_layout_detection: true,
            useLayoutDetection: true,
            merge_layout_blocks: false,
            mergeLayoutBlocks: false,
            use_ocr_for_image_block: true
        };

        console.log(`Pinging user layout endpoint ${url}...`);
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                "Authorization": `token ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const json = await res.json();
        console.log("Top level keys:", Object.keys(json));
        if (json.result) {
            console.log("Result keys:", Object.keys(json.result));
            if (json.result.layoutParsingResults) {
                console.log(`Found ${json.result.layoutParsingResults.length} layout parsing blocks.`);
                const firstMarkdown = json.result.layoutParsingResults.find(b => b.markdown && b.markdown.text);
                if (firstMarkdown) {
                    console.log("MARDKOWN DETECTED: ", firstMarkdown.markdown.text.substring(0, 100));
                } else {
                    console.log("No markdown generated within the blocks. Example block:");
                    console.log(JSON.stringify(json.result.layoutParsingResults[0], null, 2));
                }
            } else {
                console.log("No layoutParsingResults array found in result.");
                console.log("Is OCR results present?", !!json.result.ocrResults);
                if (json.result.ocrResults && json.result.ocrResults.length > 0) {
                    console.log("First OCR block keys:", Object.keys(json.result.ocrResults[0]));
                }
            }
        } else {
            console.log("API returned error:", json);
        }
    } catch (e) {
        console.error(e);
    }
}
run();
