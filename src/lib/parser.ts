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
        if (line.includes("List") || line.includes("Unit") || line.length < 3) return;

        // Strategy: First try to split by ' - ' or ' – ' which indicates a word family chain
        // Example: "able (adj.) 能够的 - unable (adj.) 不能够的 - ability (n.) 能力"

        // Normalize separators
        const normalizedLine = line.replace(/–/g, '-');

        if (normalizedLine.includes(' - ')) {
            // Complex Family Line
            const parts = normalizedLine.split(' - ').map(p => p.trim());

            // Heuristic to identify the "Root" (Family Name)
            // Usually the first word of the first part.
            // Part 0: "1. able (adj.) 能够的"
            let rootWord = "";
            const familyId = crypto.randomUUID(); // Or use root word string

            parts.forEach((part, index) => {
                // Parse each part as a standalone item
                // 1. Try Strict Match with POS: "able (adj.) 能够的"
                // Regex: Start -> (Number) -> Word(Greedy) -> (POS) -> Definition
                const strictMatch = part.match(/^(\d+[\.\s]*)?([a-zA-Z\-\s]+?)\s*(\([a-z\.]+\))\s*(.+)$/);

                // 2. Fallback: Word + Space + Definition (No POS or different format)
                // "apple 苹果"
                const fallbackMatch = part.match(/^(\d+[\.\s]*)?([a-zA-Z\-\s]+)\s+(.+)$/);

                const successfulMatch = strictMatch || fallbackMatch;

                if (successfulMatch) {
                    const word = successfulMatch[2].trim();
                    // If strict match, group 3 is pos. If fallback, group 3 is definition (and 4 is undefined)
                    const rawPos = strictMatch ? successfulMatch[3].replace(/[\(\)]/g, '') : "";
                    const def = strictMatch ? successfulMatch[4].trim() : successfulMatch[3].trim();

                    if (index === 0) rootWord = word;

                    // Standardize Answer format
                    const finalAnswer = rawPos ? `${rawPos} ${def}` : def;

                    parsedItems.push({
                        id: crypto.randomUUID(),
                        content: word,
                        type: 'vocabulary',
                        answer: finalAnswer,
                        tags: [`Family:${rootWord || word}`]
                    });
                }
            });
            return; // Skip standard processing for this line
        }

        // Standard Line Processing (No hyphen chain)
        const match = line.match(lineRegex);
        if (match) {
            let content = match[2].trim();
            // Handle (adj.) in content?
            // If regex captured "able (adj.)" as Group 2, we need to extract POS.
            const posInContent = content.match(/^([a-zA-Z\-\s]+)\s*(\([a-z\.]+\))$/);
            let extraPos = "";
            if (posInContent) {
                content = posInContent[1].trim();
                extraPos = posInContent[2].replace(/[\(\)]/g, '');
            }

            let definition = match[4].trim();
            if (extraPos) definition = `${extraPos} ${definition}`;

            parsedItems.push({
                id: crypto.randomUUID(),
                content: content,
                answer: definition,
                type: 'vocabulary',
                tags: []
            });
            return;
        }

        // ... Fallbacks (Chinese split etc) ...
        // (Keeping existing logic for "->" transformation below if needed, or replace/merge?)
        // The user specifically mentioned " - " lists.

        if (line.includes("->")) {
            // ... existing "arrow" logic ...
            const parts = line.split("->");
            const c = parts[0].replace(/^\d+[\.\s]*/, '').trim();
            const a = parts[1].trim();
            const root = c.split(' ')[0].toLowerCase();
            parsedItems.push({
                id: crypto.randomUUID(),
                content: c,
                answer: a,
                type: 'word_transformation',
                tags: [`Family:${root}`]
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
