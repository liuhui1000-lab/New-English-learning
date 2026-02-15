
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs/promises';

async function extractText(filePath) {
    try {
        const buffer = await fs.readFile(filePath);
        const uint8Array = new Uint8Array(buffer);

        const loadingTask = pdfjsLib.getDocument({
            data: uint8Array,
            isEvalSupported: false,
            useSystemFonts: true,
            cMapUrl: './node_modules/pdfjs-dist/cmaps/',
            cMapPacked: true,
        });

        const pdfDocument = await loadingTask.promise;
        console.log(`PDF Loaded. Pages: ${pdfDocument.numPages}`);

        // Questions 21-35 are usually on pages 2-4
        for (let i = 2; i <= Math.min(4, pdfDocument.numPages); i++) {
            const page = await pdfDocument.getPage(i);
            const content = await page.getTextContent();

            console.log(`\n\n--- Page ${i} ---`);
            const strings = content.items.map(item => item.str);
            // Join with newline to simulate lines better
            console.log(strings.join("\n"));
        }
    } catch (error) {
        console.error("Error extraction:", error);
    }
}

extractText('./1 2024年 上海初三闵行区二模英语试卷.pdf');
