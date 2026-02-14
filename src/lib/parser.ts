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

export async function parseDocument(file: File, mode: ImportMode = 'mock_paper', onProgress?: (msg: string) => void, skipOCR: boolean = false): Promise<ParsedQuestion[]> {
    const text = await extractText(file, onProgress, skipOCR);

    if (onProgress) onProgress("正在解析文本结构...");

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
        let step1 = cleanOCRText(cleanText);
        let step2 = extractTargetSections(step1);
        const rawQuestions = splitQuestions(step2);
        return processMockPaperMode(rawQuestions);
    }
    else if (mode === 'recitation') {
        // Recitation mode: Parse full text line-by-line for vocabulary/lists
        return processRecitationMode(text);
    }

    return [];
}

// Helper to clean common OCR noise (Headers, Footers, Page Numbers)
function cleanOCRText(text: string): string {
    return text
        .replace(/^\s*\d+\s*$/gm, '') // Remove solitary page numbers on a line
        .replace(/Page \d+ of \d+/gi, '') // Remove "Page x of y"
        .replace(/第\s*\d+\s*页/g, '') // Remove Chinese page num
        .replace(/_{5,}/g, '______') // Normalize long underlines
        .replace(/…{3,}/g, '______') // Normalize ellipses to blanks
        .replace(/\n\s*\n/g, '\n'); // Remove excessive blank lines
}

// Helper: Extract ONLY the "Grammar and Vocabulary" section if possible
function extractTargetSections(text: string): string {
    // Shanghai Paper Pattern: "II. Grammar and Vocabulary" ... "III. Reading and Writing"
    // Also common: "Part 2 Vocabulary and Grammar"
    // We look for the START of Grammar and END before Reading/Writing

    // 1. Find Start
    const startPatterns = [
        /Part\s*2\s*Grammar\s*and\s*Vocabulary/i,
        /II\.\s*Grammar\s*and\s*Vocabulary/i,
        /Section\s*B\s*Vocabulary/i,
        /Grammar\s*and\s*Vocabulary/i
    ];

    let startIndex = -1;
    for (const p of startPatterns) {
        const match = text.search(p);
        if (match !== -1) {
            startIndex = match;
            console.log(`Found Section Start at index ${startIndex}: ${p}`);
            break;
        }
    }

    // 2. Find End (Start of Next Section)
    const endPatterns = [
        /Part\s*3\s*Reading/i,
        /III\.\s*Reading/i,
        /Reading\s*Comprehension/i,
        /Writing/i
    ];

    let endIndex = text.length;
    // Search for end pattern AFTER start index
    const searchContext = startIndex !== -1 ? text.substring(startIndex) : text;

    for (const p of endPatterns) {
        const match = searchContext.search(p);
        if (match !== -1) {
            endIndex = (startIndex !== -1 ? startIndex : 0) + match;
            console.log(`Found Section End at index ${endIndex}: ${p}`);
            break;
        }
    }

    if (startIndex !== -1) {
        return text.substring(startIndex, endIndex);
    }

    // If no distinct section found, return full text (and rely on question filtering)
    console.warn("No 'Grammar/Vocabulary' section header found, parsing full text.");
    return text;
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

    // State for grouping across lines
    let currentFamilyRoot = "";

    lines.forEach(line => {
        if (line.includes("List") || line.includes("Unit") || line.length < 3) return;

        // Normalize separators
        const normalizedLine = line.replace(/–/g, '-');

        // Robust Check: Hyphens (Family) OR Wide Spaces (Phrases)
        if (/[-–]/.test(normalizedLine) || /\s{2,}|\t+/.test(normalizedLine)) {
            // 1. Pre-split by "Wide Spaces" (Tabs or 2+ spaces)
            const blocks = normalizedLine.split(/\s{2,}|\t+/);

            let hasParsed = false;

            blocks.forEach(block => {
                if (!block.trim()) return;

                // 2. Family Splitting (Hyphen with optional spaces)
                const parts = block.split(/\s*[-–]\s*/).map(p => p.trim()).filter(p => p.length > 0);

                // Local root for this block (if hyphenated chain, first is root)
                let blockRoot = "";

                parts.forEach((part, index) => {
                    // Regex Fixes:
                    // 1. Word: Allow '/' for "have/take" -> [a-zA-Z\-\s\/]
                    // 2. POS: Flexible match
                    // 3. \s* before POS group handles "word(pos)" case
                    const strictMatch = part.match(/^(\d+[\.\s]*)?([a-zA-Z\-\s\/]+?)\s*(\([a-z\.]+\))\s*(.*)$/);

                    // Fallback: Word + Space + Def
                    const fallbackMatch = part.match(/^(\d+[\.\s]*)?([a-zA-Z\-\s\/]+)\s+(.+)$/);

                    const successfulMatch = strictMatch || fallbackMatch;

                    if (successfulMatch) {
                        const word = successfulMatch[2].trim();
                        // If strict match, group 3 is pos. If fallback, group 3 is definition 
                        const rawPos = strictMatch ? successfulMatch[3].replace(/[\(\)]/g, '') : "";
                        const def = strictMatch ? successfulMatch[4].trim() : successfulMatch[3].trim();

                        // Determine Family Logic for BLOCK
                        // If it's a hyphen chain, first word is root.
                        if (index === 0) {
                            blockRoot = word;
                            // Check if this block is related to previous line's family?
                            // Usually hyphen chains are self-contained.
                            // But we can update global currentFamilyRoot.
                            if (!isRelated(currentFamilyRoot, word)) {
                                currentFamilyRoot = word;
                            }
                        }

                        // Use global root if related, else block root
                        // Actually for hyphen chains: "accept - acceptable" -> clearly same family.
                        // blockRoot is safe here.

                        // BUT, if the user has:
                        // accept ...
                        // acceptable ... (separate lines)
                        // Then we fall through to "Standard Line Processing" below.

                        // Answer Format: "pos. def" or just "def"
                        let finalAnswer = def;
                        if (rawPos) {
                            finalAnswer = def ? `${rawPos} ${def}` : rawPos;
                        }

                        if (word && (finalAnswer || rawPos)) {
                            parsedItems.push({
                                id: crypto.randomUUID(),
                                content: word,
                                type: 'vocabulary',
                                answer: finalAnswer,
                                tags: [`Family:${blockRoot || word}`]
                            });
                            hasParsed = true;
                        }
                    }
                });
            });

            if (hasParsed) return; // Skip standard processing only if we actually parsed something
        }

        // Standard Line Processing (No hyphen chain)
        const match = line.match(lineRegex);
        if (match) {
            let content = match[2].trim();
            // Handle (adj.) in content?
            const posInContent = content.match(/^([a-zA-Z\-\s]+)\s*(\([a-z\.]+\))$/);
            let extraPos = "";
            if (posInContent) {
                content = posInContent[1].trim();
                extraPos = posInContent[2].replace(/[\(\)]/g, '');
            }

            let definition = match[4].trim();
            if (extraPos) definition = `${extraPos} ${definition}`;

            // GROUPING LOGIC ACROSS LINES
            if (currentFamilyRoot === "") {
                currentFamilyRoot = content;
            } else {
                if (!isRelated(currentFamilyRoot, content)) {
                    currentFamilyRoot = content;
                }
            }

            parsedItems.push({
                id: crypto.randomUUID(),
                content: content,
                answer: definition,
                type: 'vocabulary',
                tags: [`Family:${currentFamilyRoot}`] // Use the persistent root
            });
            return;
        }

        // ... Fallback for arrows ...
        if (line.includes("->")) {
            const parts = line.split("->");
            const c = parts[0].replace(/^\d+[\.\s]*/, '').trim();
            const a = parts[1].trim();
            // Arrow usually implies derivation, so assume new root unless related
            if (!isRelated(currentFamilyRoot, c)) {
                currentFamilyRoot = c.split(' ')[0]; // simple split
            }

            parsedItems.push({
                id: crypto.randomUUID(),
                content: c,
                answer: a,
                type: 'word_transformation',
                tags: [`Family:${currentFamilyRoot}`]
            });
        }
    });

    console.log(`Recitation Mode: Parsed ${parsedItems.length} items.`);
    return parsedItems;
}

// Heuristic to check if words are related (Part of same family)
function isRelated(root: string, target: string): boolean {
    if (!root || !target) return false;
    const r = root.toLowerCase().replace(/[^a-z]/g, '');
    const t = target.toLowerCase().replace(/[^a-z]/g, '');

    // Safety for very short words
    if (r.length < 3 || t.length < 3) return r === t;

    // 1. Containment (e.g. "accept" in "acceptable")
    if (t.includes(r) || r.includes(t)) return true;

    // 2. Common Prefix (e.g. "pre" + "fer" ?) - risk of false positives.
    // Let's use a strict prefix check of 50% length?
    // "ab" vs "ac" -> no.
    // "reproduce" vs "production" -> "produc" match?
    // Let's stick to: share at least 4 chars prefix OR containment.

    let prefix = 0;
    while (prefix < r.length && prefix < t.length && r[prefix] === t[prefix]) {
        prefix++;
    }

    // "acc" (3) for "accept" and "access" -> false positive?
    // "accept" (6) -> 3 is 50%.
    // "access" (6) -> "acc" (3).
    // Let's require min(r.len, t.len) * 0.6 common prefix?
    // accept (6) -> 3.6 -> 4.
    // able (4) -> 2.4 -> 3. "abl"
    // ability (7) -> "abi" (3). "abl" vs "abi" - no match.
    // So "ability" would NOT match "able" by prefix. But "able" is NOT in "ability".
    // "le" -> "il".

    // Adjust heuristic:
    // If share first 3 chars AND length diff < 5?

    // For now, let's trust Leniency for user's sequential list.
    // If the user put them next to each other, they imply relation.
    // We only want to break if they are *clearly* different.
    // "accept" vs "banana" -> 0 prefix.

    if (prefix >= 3) return true;

    return false;
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

async function extractText(file: File, onProgress?: (msg: string) => void, skipOCR: boolean = false): Promise<string> {
    if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        if (onProgress) onProgress("正在读取 Word 文档...");
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        return result.value;
    } else if (file.type === "application/pdf") {
        try {
            if (onProgress) onProgress("正在加载 PDF 核心组件...");
            const pdfjsLib = await import("pdfjs-dist");
            // Ensure worker points to the correct version. 
            // Ideally, we should copy the worker from node_modules during build, but for now assuming public/ is correct.
            pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs`;

            if (onProgress) onProgress("正在读取文件数据...");
            const arrayBuffer = await file.arrayBuffer();

            if (onProgress) onProgress(`文件大小: ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB. 正在解析 PDF 结构...`);

            // Add Timeout Race for getDocument
            const loadTask = pdfjsLib.getDocument({
                data: arrayBuffer,
                cMapUrl: '/cmaps/',
                cMapPacked: true,
            });

            const pdf = await Promise.race([
                loadTask.promise,
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error("PDF 解析超时 (30s) - 请检查文件是否过大或损坏")), 30000))
            ]);

            let fullText = "";
            let useOCR = false;

            const totalPages = pdf.numPages;
            if (onProgress) onProgress(`PDF 加载成功，共 ${totalPages} 页。开始提取文本...`);

            for (let i = 1; i <= totalPages; i++) {
                if (onProgress) onProgress(`正在读取第 ${i}/${totalPages} 页 (文本模式)...`);

                // Add Timeout for Page Rendering too
                const page = await Promise.race([
                    pdf.getPage(i),
                    new Promise<any>((_, reject) => setTimeout(() => reject(new Error(`第 ${i} 页加载超时`)), 10000))
                ]);

                const textContent = await page.getTextContent();
                const items: any[] = textContent.items as any[];
                const pageText = items.map((item) => item.str).join(" ");

                // Improved OCR Trigger: If text is empty OR very short/garbage (likely scanned with few artifacts)
                // BUT ONLY IF NOT SKIPPING OCR
                if (!skipOCR && (/\{#\{.*?\}#\}/.test(pageText) || pageText.trim().length < 50)) { // Reduced threshold slightly
                    console.warn(`Page ${i} text length ${pageText.trim().length}, switching to OCR...`);
                    useOCR = true;
                    fullText = "";
                    break;
                }
                fullText += pageText + "\n";
            }

            if (useOCR && !skipOCR) {
                if (onProgress) onProgress(`检测到扫描件，切换至 OCR 模式 (较慢)...`);
                for (let i = 1; i <= totalPages; i++) {
                    if (onProgress) onProgress(`正在 OCR 识别第 ${i}/${totalPages} 页 (此步骤最耗时)...`);
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

        } catch (err: any) {
            console.error("PDF Processing Error:", err);
            // Re-throw with user friendly message
            if (onProgress) onProgress(`处理失败: ${err.message}`);
            throw new Error(`PDF 解析失败: ${err.message}`);
        }
    }
    throw new Error("Unsupported file type");
}

function splitQuestions(text: string): string[] {
    // Improved Regex for OCR to handle inline questions:
    // 1. Matches Start of String (^), Newline (\n), OR Wide Spaces (\s{3,})
    // 2. Followed by Number + Punctuation (Dot, Comma, Chinese Punc, or Bracket)
    const splitRegex = /(?:^|\n|\s{4,})(?:[\(（\[]?\d+[）\)\]]?[\.\,，、])/g;

    // We can't just split() because we lose the delimiter (the number). 
    // We need to match and reconstruct.

    const questions: string[] = [];
    let match;
    let lastIndex = 0;

    // Reset regex state just in case (though local var doesn't strictly need it if not global)
    // Actually splitRegex needs 'g' flag for exec loop

    // Alternative strategy: Replace the delimiters with a special marker + delimiter, then split
    // This preserves the delimiter in the result if we want, or we can just append it.

    const marker = "|||SPLIT|||";
    const textWithMarkers = text.replace(splitRegex, (match) => {
        // match is like " 21." or "\n21."
        // We want to keep the number part but add a newline marker before it
        return marker + match.trim();
    });

    const rawParts = textWithMarkers.split(marker);
    for (const p of rawParts) {
        if (p.trim()) questions.push(p.trim());
    }

    return questions;
}

function classifyQuestion(content: string): ParsedQuestion {
    let type: QuestionType = 'grammar';
    const tags: string[] = [];
    const lowerContent = content.toLowerCase();

    // 1. Sentence Transformation (Rewrite)
    // Keywords: "rewrite", "homonymous", "passive voice", "plural", "question", or Chinese prompts
    if (
        /对划线部分提问/.test(content) ||
        /改写句子/.test(content) ||
        /保持句意/i.test(content) ||
        /被动语态/i.test(content) ||
        /连词成句/i.test(content) ||
        /\(.*\)/.test(content) && content.includes('______') && (content.includes('?') || content.length > 80) // Long sentence with blanks and rewrite prompt?
    ) {
        type = 'sentence_transformation';
    }
    // 2. Word Transformation
    // Pattern: "_____ ... (word)"
    else if (/\(.*\)/.test(content) && content.includes('______')) {
        // Relaxed match: allow spaces inside parens and trailing chars
        const match = content.match(/\(([a-zA-Z\s]+)\)\s*$/) || content.match(/\(([a-zA-Z\s]+)\)[^\)]*$/);

        if (match) {
            type = 'word_transformation';
            tags.push(`Root:${match[1].trim()}`);
        } else {
            // Maybe it's a rewrite if no clean word found? 
            // But existing logic defaults to collocation if '______' exists.
            if (content.length > 50 && (content.includes('?') || content.includes('.'))) {
                // Likely a sentence-level thing if very long?
                // Let's stick to word_trans if it looks like one, otherwise collocation?
                type = 'word_transformation'; // Default to word trans if bracket exists
            } else {
                type = 'collocation';
            }
        }
    }
    // 3. Collocation / Vocabulary
    else if (content.includes('______') && !/\([a-zA-Z]+\)$/.test(content.trim())) {
        type = 'collocation';
    }
    // 4. Grammar (Multiple Choice)
    else if (/A\..*B\./.test(content)) {
        type = 'grammar';
        const keywords = ['look forward', 'interested in', 'fond of', 'succeed in', 'keen on'];
        for (const kw of keywords) {
            if (lowerContent.includes(kw)) tags.push(`Collocation:${kw}`);
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
