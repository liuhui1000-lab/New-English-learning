import mammoth from "mammoth";
import { Question, QuestionType } from "@/types";

export type ImportMode = 'recitation' | 'mock_paper' | 'error_set';

export interface ParsedQuestion {
    id: string; // Temporary ID for review
    content: string;
    type: QuestionType;
    answer: string;
    tags: string[];
}

export async function parseDocument(file: File, mode: ImportMode = 'mock_paper'): Promise<ParsedQuestion[]> {
    const text = await extractText(file);

    // 1. Remove "Answer Key" sections (Common for Mock Papers)
    // Only apply strict truncation for mock papers 
    if (mode === 'mock_paper' || mode === 'error_set') {
        const answerKeyPatterns = [
            /Reference Answers/i,
            /Key to Exercises/i,
            /Keys:/i,
            /Answers:/i,
            /参考答案/
        ];
        let cleanText = text;
        for (const pattern of answerKeyPatterns) {
            const match = cleanText.search(pattern);
            if (match !== -1) {
                console.log("Found Answer Key section, truncating for Mock Paper mode...");
                cleanText = cleanText.substring(0, match);
                break;
            }
        }
        const rawQuestions = splitQuestions(cleanText);
        return processMockPaperMode(rawQuestions);
    }
    else if (mode === 'recitation') {
        // Recitation mode: Parse full text line-by-line for vocabulary/lists
        return processRecitationMode(text);
    }

    return [];
}

function processRecitationMode(fullText: string): ParsedQuestion[] {
    // Strategy: Line-by-Line Parsing for Vocabulary/Lists
    // User goal: Import a list of words or transformations for Dictation/Selection.
    // Format assumed: "1. word definition" or "word ... definition" or "root -> derived"

    const lines = fullText.split('\n').filter(line => line.trim().length > 0);
    const parsedItems: ParsedQuestion[] = [];

    // Regex to match: Optional Number -> Word -> Separator -> Definition
    // Group 1: Numbering (e.g. "1.", "(1)")
    // Group 2: The Word / Root (Content) - greedy until separator. Allows letters, hyphens, spaces, parens.
    // Group 3: Separator (spaces, dots, arrow, or common patterns like ' adj. ')
    // Group 4: Definition / Derived Word (Answer)

    // Improved Regex to catch "apple n. 苹果" where " n. " is the separator
    const lineRegex = /^(\d+[\.\、\)\s]*)?([a-zA-Z\-\s\(\)]+?)([\s\.\…]+|->\s*|\s+[a-z]+\.\s+)(.+)$/;

    lines.forEach(line => {
        // Skip obvious junk headers
        if (line.includes("List") || line.includes("Unit") || line.length < 3) return;

        const match = line.match(lineRegex);
        if (match) {
            let word = match[2].trim();
            let definition = match[4].trim();

            // Special handling if separator was part of speech (e.g. " n. ")
            // We might want to prepend it back to definition or definition usually has it?
            // If regex group 3 was " n. ", it's consumed. match[4] is "苹果".
            // Let's refine: simpler regex often better.

            // Fallback simplistic split if regex fails or for robustness:
            // Split by first large gap or "->"?
        }

        // Alternative: Simple Line Splitter
        // Look for first non-ascii character (Chinese definition)?
        // Or look for "->"

        if (line.includes("->")) {
            // Transformation: happy -> happiness
            const parts = line.split("->");
            content = parts[0].replace(/^\d+[\.\s]*/, '').trim(); // "happy"
            answer = parts[1].trim(); // "happiness"
            type = 'word_transformation';

            // groupTag logic: Use the root word as the family identifier
            // This fulfills the user request: "Words appear in groups/families"
            const rootWord = content.split(' ')[0].toLowerCase(); // Simple heuristic
            tags.push(`Family:${rootWord}`);
        } else {
            // Match first Chinese char?
            const firstChinese = line.search(/[\u4e00-\u9fa5]/);
            if (firstChinese !== -1) {
                // English ... Chinese
                const firstPart = line.substring(0, firstChinese).trim();
                content = firstPart.replace(/^\d+[\.\s]*/, '').trim();

                // If content ends with part of speech like " n.", move it to answer?
                // For now, simple split.
                answer = line.substring(firstChinese).trim();
            } else {
                // All English? Try strict regex match again
                const m = line.match(lineRegex);
                if (m) {
                    content = m[2].trim();
                    answer = m[4].trim();
                }
            }
        }

        if (content && answer) {
            parsedItems.push({
                id: crypto.randomUUID(),
                content: content,
                answer: answer,
                type: type, // 'vocabulary' or 'word_transformation'
                tags: ['Recitation']
            });
        }
    });

    console.log(`Recitation Mode: Parsed ${parsedItems.length} items.`);
    return parsedItems;
}

function processMockPaperMode(rawItems: string[]): ParsedQuestion[] {
    // Strategy: Strict Filter. Keep only Questions (blanks/options).
    const filteredQuestions = rawItems.filter(q => {
        const hasBlank = /_+|\(\s{3,}\)|\[\s{3,}\]/.test(q);
        const hasOptions = /A\..*B\./.test(q);
        return hasBlank || hasOptions;
    });

    console.log(`Mock Paper Mode: Filtered ${rawItems.length} items down to ${filteredQuestions.length}`);
    return filteredQuestions.map(classifyQuestion);
}

// ... Shared Helpers ...

async function extractText(file: File): Promise<string> {
    if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        return result.value;
    } else if (file.type === "application/pdf") {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs`;

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({
            data: arrayBuffer,
            cMapUrl: '/cmaps/',
            cMapPacked: true,
        }).promise;
        let fullText = "";
        let useOCR = false;

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const items: any[] = textContent.items as any[];
            const pageText = items.map((item) => item.str).join(" ");

            if (/\{#\{.*?\}#\}/.test(pageText) || pageText.trim().length === 0) {
                console.warn(`Page ${i} seems obfuscated, switching to OCR...`);
                useOCR = true;
                fullText = "";
                break;
            }
            fullText += pageText + "\n";
        }

        if (useOCR) {
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                try {
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
    const splitRegex = /(\n\s*(?:\(?\d+[\.\)、]\s*|\d+\s+))/g;
    const parts = text.split(splitRegex);
    const questions: string[] = [];
    let currentQuestion = "";
    for (let i = 0; i < parts.length; i++) {
        if (splitRegex.test(parts[i])) {
            if (currentQuestion.trim()) questions.push(currentQuestion.trim());
            currentQuestion = parts[i];
        } else {
            currentQuestion += parts[i];
        }
    }
    if (currentQuestion.trim()) questions.push(currentQuestion.trim());
    return questions;
}

function classifyQuestion(content: string): ParsedQuestion {
    let type: QuestionType = 'grammar';
    const tags: string[] = [];

    if (/\(.*\)/.test(content) && content.includes('______')) {
        type = 'word_transformation';
        const match = content.match(/\(([a-zA-Z]+)\)$/);
        if (match) tags.push(`Root:${match[1]}`);
    }
    else if (content.includes('______') && !/\([a-zA-Z]+\)$/.test(content.trim())) {
        type = 'collocation';
    }
    // Check for grammar options
    else if (/A\..*B\./.test(content)) {
        type = 'grammar';
        const keywords = ['look forward', 'interested in', 'fond of', 'succeed in', 'keen on'];
        for (const kw of keywords) {
            if (content.toLowerCase().includes(kw)) tags.push(`Collocation:${kw}`);
        }
    }

    return {
        id: crypto.randomUUID(),
        content: content,
        type: type,
        answer: '',
        tags: tags
    };
}

// ... OCR Helpers ...

async function ocrPdfPage(page: any): Promise<string> {
    try {
        return await extractPageText(page, 1.5, 0.8);
    } catch (e: any) {
        console.warn("OCR Attempt 1 failed, retrying...", e);
        try {
            return await extractPageText(page, 1.0, 0.5);
        } catch (retryError: any) {
            throw new Error(retryError.message || "OCR Failed");
        }
    }
}

async function extractPageText(page: any, scale: number, quality: number): Promise<string> {
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error("Canvas context missing");

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: context, viewport: viewport }).promise;

    let currentQuality = quality;
    let base64Image = canvas.toDataURL('image/jpeg', currentQuality);
    const MAX_BASE64_LENGTH = 3 * 1024 * 1024;

    while (base64Image.length > MAX_BASE64_LENGTH && currentQuality > 0.1) {
        currentQuality -= 0.2;
        base64Image = canvas.toDataURL('image/jpeg', currentQuality);
    }

    if (base64Image.length > MAX_BASE64_LENGTH) {
        throw new Error("Page image too large");
    }

    const image = base64Image.replace(/^data:image\/\w+;base64,/, "");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 50000);

    try {
        const response = await fetch('/api/ocr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`OCR Error: ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        return data.text || "";
    } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') throw new Error("OCR Timeout");
        throw error;
    }
}
