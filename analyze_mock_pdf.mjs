import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const pdfPath = process.argv[2];

if (!pdfPath) {
    console.error("Usage: node analyze_mock_pdf.mjs <pdf_path>");
    process.exit(1);
}

async function extractText(path) {
    console.log(`Analyzing: ${path}`);
    const loadingTask = getDocument({
        url: path,
        cMapUrl: "./node_modules/pdfjs-dist/cmaps/",
        cMapPacked: true,
    });
    const pdf = await loadingTask.promise;
    let fullText = "";

    for (let i = 1; i <= Math.min(pdf.numPages, 5); i++) { // Analyze first 5 pages only for speed
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item) => item.str).join(" ");
        fullText += `--- Page ${i} ---\n${pageText}\n`;
    }

    console.log("\n--- Extracted Content (Snippet) ---");
    console.log(fullText.substring(0, 1000));

    // Check for Patterns
    console.log("\n--- Pattern Analysis ---");
    const questionMatch = fullText.match(/(\d+)\.\s*([A-Za-z\s_]+)/g);
    console.log(`Detected generic "Number. Text" patterns: ${questionMatch ? questionMatch.length : 0}`);

    const choiceMatch = fullText.match(/A\..*B\./g);
    console.log(`Detected Choice "A. ... B." patterns: ${choiceMatch ? choiceMatch.length : 0}`);

    const blankMatch = fullText.match(/_+|\(\s{3,}\)/g);
    console.log(`Detected Blanks (____ or (   )): ${blankMatch ? blankMatch.length : 0}`);
}

extractText(pdfPath).catch(err => console.error(err));
