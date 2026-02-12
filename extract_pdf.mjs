
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs/promises';

async function extractText(filePath) {
    try {
        const buffer = await fs.readFile(filePath);
        const uint8Array = new Uint8Array(buffer);

        const loadingTask = pdfjsLib.getDocument({
            data: uint8Array,
            // Disable worker for simple Node usage if possible, or let it fallback
            isEvalSupported: false,
            useSystemFonts: true,
        });

        const pdfDocument = await loadingTask.promise;
        console.log(`PDF Loaded. Pages: ${pdfDocument.numPages}`);

        for (let i = 1; i <= Math.min(5, pdfDocument.numPages); i++) {
            const page = await pdfDocument.getPage(i);
            const content = await page.getTextContent();

            // Map items to string, check if they are separated by extensive whitespace
            // PDF text content often comes as separate items for each position.
            // We want to see how they are structured.

            console.log(`\n\n--- Page ${i} ---`);

            // Simulating how a parser might stitch them:
            let lastY = -1;
            let textBuffer = "";

            // Simple join
            const strings = content.items.map(item => item.str);
            console.log(strings.join(" ||| ")); // Use triple pipe to see item boundaries
        }
    } catch (error) {
        console.error("Error extraction:", error);
    }
}

extractText('./中考考纲词性转换表单.pdf');
