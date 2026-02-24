const fs = require('fs');
async function run() {
    const image = "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAXSURBVDhPYxgFsBDg/wiN+RgFgwoGBgAAlQMBB9zN30MAAAAASUVORK5CYII=";
    const url = "https://5ejew8k4i019dek5.aistudio-app.com/layout-parsing";
    const token = "483605608bc2d69ed9979463871dd4bc6095285a";

    const payload = {
        file: image,
        fileType: 1
    };

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.result && data.result.layoutParsingResults) {
            console.log("Found layoutParsingResults length:", data.result.layoutParsingResults.length);
            if (data.result.layoutParsingResults.length > 0) {
                console.log("FIRST ITEM:", JSON.stringify(data.result.layoutParsingResults[0]));
            }
        } else {
            console.log("Missing layoutParsingResults");
        }
    } catch (e) { console.error(e); }
}
run();
