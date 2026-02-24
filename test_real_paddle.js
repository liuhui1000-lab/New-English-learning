const fs = require('fs');

async function run() {
    // 1 pixel dot base64 is too small for layout.
    // Let's use a 100x100 white image base64, or just download a remote dummy image
    // I will fetch a small remote image, convert to base64, and send it.

    console.log("Fetching sample image...");
    const imgRes = await fetch("https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/React-icon.svg/120px-React-icon.svg.png");
    const arrayBuffer = await imgRes.arrayBuffer();
    const b64 = Buffer.from(arrayBuffer).toString('base64');

    const url = "https://5ejew8k4i019dek5.aistudio-app.com/layout-parsing";
    const token = "483605608bc2d69ed9979463871dd4bc6095285a";

    const payload = {
        file: b64,
        fileType: 1,
        use_layout_detection: true,
        useLayoutDetection: true,
        merge_layout_blocks: false,
        mergeLayoutBlocks: false,
        use_ocr_for_image_block: true
    };

    console.log("Sending...");
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.result && data.result.layoutParsingResults) {
            console.log("Layout Parsing Results Length:", data.result.layoutParsingResults.length);
            let fullMarkdown = "";
            for (let i = 0; i < data.result.layoutParsingResults.length; i++) {
                const lp = data.result.layoutParsingResults[i];
                console.log(`[${i}] type: ${lp.type}, hasMarkdown: ${!!lp.markdown}, text: ${lp.markdown ? lp.markdown.text : 'null'}`);
                if (lp.markdown && lp.markdown.text) {
                    fullMarkdown += lp.markdown.text + "\n\n";
                }
            }
            console.log("\n--- Full Markdown ---");
            console.log(fullMarkdown);
            console.log("---------------------\n");
        } else {
            console.log("No layoutParsingResults");
        }
    } catch (e) { console.error(e); }
}
run();
