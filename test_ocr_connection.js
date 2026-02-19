
// Use native fetch (Node 18+)
// const fetch = require('node-fetch');

// Hardcoded for connectivity test
const API_URL = "https://42g0y668o7v230je.aistudio-app.com/ocr";
const TOKEN = "483605608bc2d69ed9979463871dd4bc6095285a"; // Default from route.ts

// A tiny 1x1 base64 white pixel
const TINY_IMAGE = "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9U6KKKAP/2Q==";

async function testConnection() {
    console.log(`Connecting to: ${API_URL}`);
    console.log(`Using Token: ${TOKEN.substring(0, 5)}...`);

    const payload = {
        file: TINY_IMAGE,
        fileType: 1,
        useDocOrientationClassify: false,
        useDocUnwarping: false,
        useTextlineOrientation: false
    };

    try {
        const start = Date.now();
        console.log("Sending request...");
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: {
                "Authorization": `token ${TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });
        const duration = Date.now() - start;
        console.log(`Response Status: ${res.status} (${duration}ms)`);

        if (!res.ok) {
            const errText = await res.text();
            console.error("API Error Body:", errText);
            return;
        }

        const data = await res.json();
        console.log("Success! Data keys:", Object.keys(data));
        console.log(JSON.stringify(data, null, 2));

    } catch (err) {
        console.error("Connectivity Check Failed:", err);
    }
}

testConnection();
