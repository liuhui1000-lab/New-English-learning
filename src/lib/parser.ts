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
        // Use unpkg or cdnjs which matches the version
        // Note: In a real prod app, you might want to host the worker file locally in public/
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = "";

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            // Type assertion for items
            const items: any[] = textContent.items as any[];
            const pageText = items.map((item) => item.str).join(" ");
            fullText += pageText + "\n";
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
