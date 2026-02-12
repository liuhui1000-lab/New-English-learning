import mammoth from "mammoth";
import { Question, QuestionType } from "@/types";

export interface ParsedQuestion {
    id: string; // Temporary ID for review
    content: string;
    type: QuestionType;
    answer: string;
    tags: string[];
}

export async function parseDocument(file: File): Promise<ParsedQuestion[]> {
    const text = await extractText(file);
    const rawQuestions = splitQuestions(text);
    return rawQuestions.map(classifyQuestion);
}

async function extractText(file: File): Promise<string> {
    if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        return result.value;
    } else if (file.type === "application/pdf") {
        // Dynamic import to avoid SSR issues with canvas/DOMMatrix
        const pdfjsLib = await import("pdfjs-dist");

        // Set worker source
        // Use local file in public/ for reliability (copied from node_modules)
        pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs`;

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({
            data: arrayBuffer,
            cMapUrl: '/cmaps/',
            cMapPacked: true,
        }).promise;
        let fullText = "";
        let useOCR = false;

        // Pass 1: Try Text Extraction
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const items: any[] = textContent.items as any[];
            const pageText = items.map((item) => item.str).join(" ");

            // Check for garbage/obfuscated text pattern (e.g. {#{...}#})
            if (/\{#\{.*?\}#\}/.test(pageText) || pageText.trim().length === 0) {
                console.warn(`Page ${i} seems obfuscated or empty, switching to OCR...`);
                useOCR = true;
                fullText = ""; // Reset
                break;
            }
            fullText += pageText + "\n";
        }

        // Pass 2: OCR Fallback (if needed)
        if (useOCR) {
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                try {
                    // Start with high quality, fallback to lower if needed
                    const ocrText = await ocrPdfPage(page);
                    fullText += ocrText + "\n";
                } catch (e: any) {
                    console.error(`OCR failed for page ${i}`, e);
                    fullText += `[Page ${i} OCR Failed: ${e.message}]\n`;
                }
            }
        }

        return fullText;
    }
    throw new Error("Unsupported file type");
}

function splitQuestions(text: string): string[] {
    // Regex to match question numbers like "1.", "26.", "(1)", etc.
    // This is a heuristic and might need tuning based on actual papers
    const splitRegex = /(\n\s*\(?\d+[\.\)]\s*)/g;

    // Split and keep delimiters
    const parts = text.split(splitRegex);

    const questions: string[] = [];
    let currentQuestion = "";

    for (let i = 0; i < parts.length; i++) {
        if (splitRegex.test(parts[i])) {
            // Found a new number, push previous question if exists
            if (currentQuestion.trim()) {
                questions.push(currentQuestion.trim());
            }
            currentQuestion = parts[i]; // Start new question with the number
        } else {
            currentQuestion += parts[i];
        }
    }
    if (currentQuestion.trim()) {
        questions.push(currentQuestion.trim());
    }

    return questions;
}

function classifyQuestion(content: string): ParsedQuestion {
    let type: QuestionType = 'grammar'; // Default
    const tags: string[] = [];

    // Heuristic Logic
    if (content.includes('______') && /\([a-zA-Z]+\)$/.test(content.trim())) {
        type = 'word_transformation';
        // Extract root word from (word)
        const match = content.match(/\(([a-zA-Z]+)\)$/);
        if (match) tags.push(`Root:${match[1]}`);
    } else if (/A\..*B\..*C\..*D\./.test(content) || /A\..*B\..*C\./.test(content)) {
        type = 'grammar';
        // Detect Collocation Keywords
        const keywords = ['look forward', 'interested in', 'fond of', 'succeed in'];
        for (const kw of keywords) {
            if (content.toLowerCase().includes(kw)) {
                // Could be collocation
                tags.push(`Collocation:${kw}`);
            }
        }
    }

    return {
        id: crypto.randomUUID(),
        content: content,
        type: type,
        answer: '', // Extracted if possible, otherwise empty
        tags: tags
    };
}

// Helper: OCR a single PDF page with retry logic
async function ocrPdfPage(page: any): Promise<string> {
    try {
        // Attempt 1: High Quality (Scale 1.5, JPEG 0.8)
        return await extractPageText(page, 1.5, 0.8);
    } catch (e: any) {
        console.warn("OCR Attempt 1 failed, retrying with lower quality...", e);
        try {
            // Attempt 2: Standard Quality (Scale 1.0, JPEG 0.5) - Smaller payload
            return await extractPageText(page, 1.0, 0.5);
        } catch (retryError: any) {
            throw new Error(retryError.message || "OCR Failed after retries");
        }
    }
}

async function extractPageText(page: any, scale: number, quality: number): Promise<string> {
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error("Canvas context not available");

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({
        canvasContext: context,
        viewport: viewport
    }).promise;

    const base64Image = canvas.toDataURL('image/jpeg', quality);
    const image = base64Image.replace(/^data:image\/\w+;base64,/, "");

    const response = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image })
    });

    if (!response.ok) {
        let errText = "";
        try {
            errText = await response.text();
        } catch (e) { }
        throw new Error(`OCR Service Error: ${response.status} ${errText.substring(0, 100)}`);
    }

    const data = await response.json();
    if (data.error) throw new Error(data.error);

    return data.text || "";
}
