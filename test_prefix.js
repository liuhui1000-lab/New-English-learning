const fs = require('fs');
async function run() {
    console.log("Fetching sample image...");
    const imgRes = await fetch("https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/React-icon.svg/120px-React-icon.svg.png");
    const arrayBuffer = await imgRes.arrayBuffer();
    const rawB64 = Buffer.from(arrayBuffer).toString('base64');

    const url = "https://5ejew8k4i019dek5.aistudio-app.com/layout-parsing";
    const token = process.env.PADDLE_OCR_TOKEN || "YOUR_PADDLE_OCR_TOKEN_HERE";

    // With prefix
    const payload = {
        file: "data:image/png;base64," + rawB64,
        fileType: 1
    };

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        console.log("With Prefix:");
        if (data.result && data.result.layoutParsingResults) {
            console.log("Found layoutParsingResults length:", data.result.layoutParsingResults.length);
            if (data.result.layoutParsingResults[0].markdown) {
                console.log(data.result.layoutParsingResults[0].markdown.text);
            }
        } else {
            console.log("Missing layoutParsingResults");
            console.log(JSON.stringify(data));
        }
    } catch (e) { console.error(e); }
}
run();
