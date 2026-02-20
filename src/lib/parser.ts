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
        // Step 2: Extract ONLY the target sections (Grammar/Vocabulary, Word/Sentence Transformation)
        console.log('Calling extractTargetSections...');
        let step2 = extractTargetSections(step1);
        console.log(`extractTargetSections returned ${step2.length} chars (was ${step1.length})`);
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
        .replace(/\\underline\{([^{}]+)\}/g, '<u>$1</u>') // Convert LaTeX underline to HTML
        .replace(/\^\{([^{}]+)\}/g, '<sup>$1</sup>') // Convert LaTeX superscript to HTML
        .replace(/(?<=[a-zA-Z\s])\$\s*(?=[a-zA-Z])/g, '') // Remove stray $ artifacts inside words
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
        /Part\s*(?:II|2)\s*(?:Phonetics\s*,?\s*|Phonetics\s*and\s*)?Vocabulary\s*and\s*Grammar/i, // Matches "Part 2 Phonetics, Vocabulary and Grammar" (User case)
        /II\.\s*(?:Phonetics\s*,?\s*)?Vocabulary\s*and\s*Grammar/i,
        /Section\s*B\s*Vocabulary/i,
        /Grammar\s*and\s*Vocabulary/i,
        /Phonetics\s*,?\s*Vocabulary\s*and\s*Grammar/i
        // Removed generic "/Choose\s*the\s*best\s*answer/i" fallback as it captures Listening sections
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
    // IMPORTANT: Only match "Reading and Writing" TOGETHER, not separately
    // This ensures we don't truncate Word Transformation or Sentence Transformation sections
    const endPatterns = [
        // Match "Part 3/III Reading and Writing" (must have both Reading AND Writing together)
        // Allow optional markdown headers (# ## ###) before "Part"
        /(?:^|\n)\s*#{0,6}\s*(?:Part\s*(?:[IVX]+|\d+|[A-Z])\.?|[IVX]+\.|[A-Z]\.)\s*Reading\s*(?:and|&)\s*Writing/i,
        // Fallback: Match generic "Reading and Writing" header
        /(?:^|\n)\s*#{0,6}\s*Reading\s*(?:and|&)\s*Writing/i,
        // Match "Part 3" or "Part III" or "III." (Reading/Writing section start)
        // CRITICAL: Handle OCR misreadings of III (111, TII, IlI) and Reading (Reacling, Reeding)
        // Boundaries: Line start, 3+ spaces, or punctuation/parentheses.
        /(?:^|\n|\s{3,}|[\.!\?\)\]）\s])(?:Part\s*(?:III|I{3}|1{3}|TII|Three|3)|III|I{3}|1{3}|TII)\.?\s*(?:Rea[dl]ing|Writing)/i,
        // Fallback for "Part 3" without the word Reading
        /(?:^|\n|\s{3,}|[\.!\?\)\]）\s])(?:Part\s*(?:III|I{3}|1{3}|TII|Three|3)|III|I{3}|1{3}|TII)\s*(?:\n|(?:\(|（))/i,
        // Match "VII. Writing" or similar (Writing section)
        // Handle OCR: VII -> VIL, VIII -> VILI/VIIII
        /(?:^|\n|\s{3,}|[\.!\?\)\]）\s])(?:VII|VIL|VIII|VILI|Part\s*(?:VII|7|Seven))\.?\s*Writing/i,
        // Match generic Reading and Writing with very loose spelling
        /(?:^|\n|\s{3,}|[\.!\?\)\]）\s])(?:Rea[dl]ing|Writ[il]ng)\s*(?:and|&)\s*(?:Writ[il]ng|Rea[dl]ing)/i,
        // Match writing prompts (e.g., "94. Write at least...")
        /(?:^|\n|\s{3,}|[\.!\?\)\]）\s])(?:\d+\.\s*)?Write\s+at\s+least/i,
    ];

    let endIndex = text.length;
    // Search for end pattern AFTER start index
    const searchContext = startIndex !== -1 ? text.substring(startIndex) : text;
    console.log(`Searching for section end in ${searchContext.length} chars`);
    console.log('Search context preview (last 500 chars):', searchContext.substring(Math.max(0, searchContext.length - 500)));

    for (const p of endPatterns) {
        const match = searchContext.search(p);
        if (match !== -1) {
            // Safety check: ensure the match isn't right at the start (e.g. "Read the passage" instruction inside the grammar section?)
            // Usually these headers start a new block.
            endIndex = (startIndex !== -1 ? startIndex : 0) + match;
            console.log(`Found Section End at index ${endIndex}: ${p}`);
            console.log('End pattern matched text:', searchContext.substring(match, match + 100));
            break;
        } else {
            console.log(`Pattern ${p} did NOT match`);
        }
    }

    if (startIndex !== -1) {
        return text.substring(startIndex, endIndex);
    }

    // Fallback: If no explicit "Grammar" section found, but we see "Part I Listening",
    // try to find the END of Listening (Start of Part II/2/II) even if it doesn't say "Grammar".
    const listeningStart = text.search(/Part\s*I\s*Listening/i);
    if (listeningStart !== -1) {
        // Look for Part II, Part 2, II. (generic)
        const part2Regex = /(?:Part\s*(?:II|2)|II\.|Section\s*(?:B|II))/;
        const part2Match = text.substring(listeningStart).search(part2Regex);
        if (part2Match !== -1) {
            const fallbackStart = listeningStart + part2Match;
            // Sanity check: is it reasonably far?
            if (part2Match > 100) {
                console.log("Fallback: Found generic Part II start after Listening, using as start.");
                // Re-calculate end index from this new start
                let fallbackEnd = text.length;
                const searchContext = text.substring(fallbackStart);
                for (const p of endPatterns) {
                    const match = searchContext.search(p);
                    if (match !== -1) {
                        fallbackEnd = fallbackStart + match;
                        break;
                    }
                }
                return text.substring(fallbackStart, fallbackEnd);
            }
        }
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
    console.log(`processMockPaperMode: Input ${rawItems.length} items`);
    console.log('Question numbers:', rawItems.map(q => q.match(/^\d+\./)?.[0] || 'NO_NUM').slice(0, 20));

    const parsedAndFilteredQuestions = rawItems
        .map((item) => classifyQuestion(item))
        .filter(q => {
            // 1. Must have a blank, options, OR be a sentence reordering question
            const hasBlank = /_+|\(\s{3,}\)|\[\s{3,}\]/.test(q.content);
            const hasOptions = /[A-D][\)\.].*[A-D][\)\.]/.test(q.content);
            // Sentence reordering: multiple comma-separated words + keywords
            const isSentenceReordering = /连词成句|reorder|rearrange/i.test(q.content) ||
                (/,\s*\w+,\s*\w+,\s*\w+/.test(q.content) && /\(.*\)/.test(q.content));

            if (!hasBlank && !hasOptions && !isSentenceReordering) {
                const qNum = q.content.match(/^\d+\./)?.[0] || 'UNKNOWN';
                console.log(`Filtered out ${qNum}: no blank, options, or sentence reordering pattern`);
                return false;
            }

            // 2. Filter out "Listening" style questions (Empty content with just a blank)
            // e.g. "1. ______" or "1. (     )" with no no other text
            // Clean the question number for checking
            const cleanQ = q.content.replace(/^[\(（\[]?\d+[）\)\]]?[\.\,，、]/, '').trim();
            // If the remaining text is JUST underscores/blanks, it's likely listening
            if (/^(_+|[\(\[]\s*[\)\]])$/.test(cleanQ)) {
                const qNum = q.content.match(/^\d+\./)?.[0] || 'UNKNOWN';
                console.log(`Filtered out ${qNum}: looks like a listening question (just blank)`);
                return false;
            }

            // 3. Filter out "First Letter" questions (detected via instructions in the content if header missed)
            if (q.content.includes("首字母") || q.content.includes("beginning with")) {
                const qNum = q.content.match(/^\d+\./)?.[0] || 'UNKNOWN';
                console.log(`Filtered out ${qNum}: first letter question`);
                return false;
            }

            return true;
        });


    console.log(`Mock Paper Mode: Filtered ${rawItems.length} items down to ${parsedAndFilteredQuestions.length}`);
    return parsedAndFilteredQuestions;
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
            // User requested to not cut off easily. Extending to 5 minutes (300s) to accommodate slow networks/files.
            const loadTask = pdfjsLib.getDocument({
                data: arrayBuffer,
                cMapUrl: '/cmaps/',
                cMapPacked: true,
            });

            const pdf = await Promise.race([
                loadTask.promise,
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error("PDF 加载超时 (5分钟) - 网络可能过慢或文件损坏")), 300000))
            ]);

            let fullText = "";
            let useOCR = false;

            const totalPages = pdf.numPages;
            if (onProgress) onProgress(`PDF 加载成功，共 ${totalPages} 页。开始提取文本...`);

            for (let i = 1; i <= totalPages; i++) {
                if (onProgress) onProgress(`正在读取第 ${i}/${totalPages} 页 (文本模式)...`);

                // Add Timeout for Page Rendering too (60s per page)
                const page = await Promise.race([
                    pdf.getPage(i),
                    new Promise<any>((_, reject) => setTimeout(() => reject(new Error(`第 ${i} 页加载超时 (60s)`)), 60000))
                ]);

                const textContent = await page.getTextContent();
                const items: any[] = textContent.items as any[];
                const pageText = items.map((item) => item.str).join(" ");

                // Improved OCR Trigger Check
                if (!skipOCR && isGarbageText(pageText)) {
                    console.warn(`Page ${i}: Native text deemed unusable (empty/garbage/short). Switching to OCR...`);
                    useOCR = true;
                    fullText = "";
                    break;
                }
                fullText += pageText + "\n";
            }

            if (useOCR && !skipOCR) {
                if (onProgress) onProgress(`检测到扫描件，切换至 OCR Mode (需排队处理)...`);
                for (let i = 1; i <= totalPages; i++) {
                    if (onProgress) onProgress(`正在 OCR 识别第 ${i}/${totalPages} 页...`);

                    // Rate Limit Protection: Wait 1.5s before processing each page
                    // This ensures we never exceed 1 QPS even if the API responds instantly
                    if (i > 1) {
                        await new Promise(r => setTimeout(r, 1500));
                    }

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
    // Strategy: Split on question numbers, then recombine number with content
    // This handles cases where questions are separated by minimal spacing (e.g., "D) / 22.")

    // 1. Remove section headers first
    // CRITICAL: Use [^\n]* instead of .* to match only until end of line
    const sectionHeaderRegex = /(?:^|\n)\s*(?:#{2,}\s*)?(?:Part\s+[A-Z]|Section\s+[A-Z]|[IVX]+\.\s+[^\n]*|[A-Z]\.\s+(?:Read|Complete|Fill|Choose|Section|Listen)[^\n]*|Choose\s+the\s+best\s+answer[^\n]*|Listen\s+to\s+the\s+passage[^\n]*)(?:\n|$)/gi;
    console.log(`splitQuestions: Input text length: ${text.length}`);
    console.log('Input text preview:', text.substring(0, 500));
    let cleanText = text.replace(sectionHeaderRegex, '\n');
    console.log(`After header removal: ${cleanText.length} chars`);
    console.log('Clean text preview:', cleanText.substring(0, 500));

    // 2. Split on question numbers (e.g., "21.", "22.", etc.)
    // Use capturing group to keep the numbers
    const parts = cleanText.split(/(\d+\.)/);
    console.log(`splitQuestions: Split into ${parts.length} parts`);
    console.log('First 5 parts:', parts.slice(0, 10).map(p => p.substring(0, 50)));

    const questions: string[] = [];
    let currentQuestion = '';

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i].trim();
        if (!part) continue;

        // Check if this part is a question number
        if (/^\d+\.$/.test(part)) {
            // Save previous question if exists
            if (currentQuestion) {
                questions.push(currentQuestion.trim());
            }
            // Start new question with this number
            currentQuestion = part;
        } else {
            // Append content to current question
            if (currentQuestion) {
                currentQuestion += ' ' + part;
            } else {
                // Content before first question number (likely preamble)
                // Skip it or handle specially
                continue;
            }
        }
    }

    // Don't forget the last question
    if (currentQuestion) {
        questions.push(currentQuestion.trim());
    }

    // 3. Clean up each question: remove embedded section headers
    // Pattern: optional markdown headers (####) + Roman numerals/letters/Part + section instructions
    // Matches: "V. Rewrite...", "#### III. Choose...", "## Part 2 Phonetics..."
    const embeddedHeaderRegex = /\s*#{0,}\s*(?:(?:[IVX]+|[A-Z])\.\s+(?:Choose|Complete|Fill|Read|Write|Rewrite|Transform)|Part\s+\d+)[^\n]*/i;
    const cleanedQuestions = questions.map(q => {
        // Find if there's an embedded header
        const match = q.search(embeddedHeaderRegex);
        if (match !== -1) {
            // Truncate at the header
            return q.substring(0, match).trim();
        }
        return q;
    });

    // 4. Filter out non-questions (too short, or looks like a header)
    console.log(`Before filtering: ${cleanedQuestions.length} questions`);
    const filtered = cleanedQuestions.filter(q => {
        // Must have reasonable length
        if (q.length < 10) {
            console.log('Filtered (too short):', q);
            return false;
        }
        // Must start with a number
        if (!/^\d+\./.test(q)) {
            console.log('Filtered (no number):', q.substring(0, 50));
            return false;
        }
        // Filter out Roman numeral headers that might have slipped through
        if (/^[IVX]+\.\s/.test(q) && q.length < 100) {
            console.log('Filtered (Roman numeral):', q);
            return false;
        }
        return true;
    });
    console.log(`After filtering: ${filtered.length} questions`);
    return filtered;
}

function classifyQuestion(content: string): ParsedQuestion {
    let type: QuestionType = 'grammar';
    const tags: string[] = [];
    const lowerContent = content.toLowerCase();

    // Check for blanks (at least 2 consecutive underscores)
    const hasBlank = /_{2,}/.test(content);
    // Check for root word at the end: (word)
    const rootWordMatch = content.match(/\(([a-zA-Z\s]+)\)\s*$/) || content.match(/\(([a-zA-Z\s]+)\)[^\)]*$/);

    // 1. Sentence Transformation (Rewrite)
    // Keywords: "rewrite", "homonymous", "passive voice", "plural", "question", or Chinese prompts
    if (
        /对划线部分提问/.test(content) ||
        /改写句子/.test(content) ||
        /改为/.test(content) || // Covers "改为被动", "改为间接", "改为否定" etc.
        /间接引语/.test(content) ||
        /反意疑问句/.test(content) ||
        /感叹句/.test(content) ||
        /保持句意/i.test(content) ||
        /被动语态/i.test(content) ||
        /连词成句/i.test(content) ||
        (content.includes('?') && hasBlank && rootWordMatch && content.length > 100) // Long question with blank + root word might be rewrite
    ) {
        type = 'sentence_transformation';
    }
    // 2. Word Transformation
    // Pattern: "_____ ... (word)"
    else if (rootWordMatch && hasBlank) {
        type = 'word_transformation';
        if (rootWordMatch[1]) {
            tags.push(`Root:${rootWordMatch[1].trim()}`);
        }
    }
    // 3. Collocation / Vocabulary
    else if (hasBlank && !rootWordMatch && !content.includes('A)') && !content.includes('A.')) {
        // If it has a blank but no options (A/B/C/D) and no root word, likely a collocation fill-in
        type = 'grammar';
        tags.push('Collocation');
    }
    // 4. Grammar (Default or explicit options)
    // If it mentions A) B) C) etc, it's definitely grammar.
    // BUT we want to distinguish Collocation (Prepositions/Phrases) from Pure Grammar.
    else if (/[A-D][\)\.]/.test(content)) {
        if (isCollocationOptions(content)) {
            type = 'grammar';
            tags.push('Collocation');
        } else {
            type = 'grammar';
        }
    }

    return {
        id: crypto.randomUUID(), // Use crypto for unique ID
        content: content,
        type: type,
        answer: '',
        tags: tags
    };
}

// Helper: Check if options suggest a Collocation/Preposition question
function isCollocationOptions(content: string): boolean {
    // Extract options part (heuristic: from first "A." or "A)" or "a." or "a)" to end)
    const optionsMatch = content.match(/(?:[Aa][\.\)]|[Aa]\s)[\s\S]*$/);
    if (!optionsMatch) return false;

    const optionsText = optionsMatch[0].toLowerCase();

    // Split into parts based on A/B/C/D markers (case insensitive for safety, though text is lowercased)
    // Regex: Split by ANY expected option marker
    const parts = optionsText.split(/[a-dA-D][\.\)]\s+/).map(p => p.trim()).filter(p => p);

    if (parts.length < 2) return false;

    // List of common prepositions/particles used in collocations
    const prepositions = new Set([
        "in", "on", "at", "for", "of", "by", "with", "about",
        "after", "before", "up", "down", "out", "off", "to", "from", "into", "onto",
        "over", "under", "above", "below", "through", "across", "along", "since", "until",
        "between", "among", "without", "within", "during", "towards", "inside", "outside",
        "near", "past", "round", "around", "behind", "beneath", "beside", "beyond"
    ]);

    let prepCount = 0;

    parts.forEach(p => {
        // Remove trailing option markers if any (e.g. "at B.") -> "at"
        const clean = p.replace(/[A-D][\.\)]/g, '').trim();
        // Check if the *entire* content is a preposition, or very short phrase
        // Allow leading/trailing punctuation
        const w = clean.replace(/[^a-z]/g, '');

        if (prepositions.has(w)) {
            prepCount++;
        }
    });

    // If 2 or more options are prepositions, it's likely a collocation question
    return prepCount >= 2;
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

    // Retry Logic for Rate Limits (429) & Transient Errors
    const MAX_RETRIES = 3;
    let attempt = 0;

    while (attempt <= MAX_RETRIES) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s per individual attempt

        try {
            const response = await fetch('/api/ocr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (response.status === 429) {
                // Rate Limit Hit
                const retryAfter = response.headers.get("Retry-After");
                let waitMs = retryAfter ? (parseInt(retryAfter) * 1000) : (Math.pow(2, attempt) * 1000 + Math.random() * 500);
                // Cap wait time
                waitMs = Math.min(waitMs, 10000);

                console.warn(`OCR Rate Limit (429) on attempt ${attempt + 1}. Waiting ${waitMs}ms...`);

                if (attempt < MAX_RETRIES) {
                    await new Promise(r => setTimeout(r, waitMs));
                    attempt++;
                    continue;
                } else {
                    throw new Error("OCR Rate Limit Exceeded (Max Retries)");
                }
            }

            if (!response.ok) {
                // For 5xx errors, maybe retry once?
                if (response.status >= 500 && attempt < MAX_RETRIES) {
                    console.warn(`OCR Server Error (${response.status}). Retrying...`);
                    await new Promise(r => setTimeout(r, 1000));
                    attempt++;
                    continue;
                }
                throw new Error(`OCR Error: ${response.status}`);
            }

            const data = await response.json();
            if (data.error) throw new Error(data.error);

            return data.text || "";

        } catch (error: any) {
            clearTimeout(timeoutId);

            // AbortError -> Timeout
            if (error.name === 'AbortError') {
                if (attempt < MAX_RETRIES) {
                    console.warn(`OCR Timeout on attempt ${attempt + 1}. Retrying...`);
                    attempt++;
                    continue;
                }
                throw new Error("OCR Timeout (Max Retries)");
            }

            // Network errors (fetch failed) -> Retry
            if (attempt < MAX_RETRIES && error.message !== "OCR Rate Limit Exceeded (Max Retries)") {
                console.warn(`OCR Network Error: ${error.message}. Retrying...`);
                await new Promise(r => setTimeout(r, 1000));
                attempt++;
                continue;
            }

            throw error;
        }
    }
    throw new Error("OCR Failed after retries");
}

/**
 * Heuristic to detect if native PDF text is valid or garbage/scanning artifacts.
 * Returns TRUE if text seems unusable (should trigger OCR).
 */
function isGarbageText(text: string): boolean {
    const trimmed = text.trim();
    if (trimmed.length < 20) return true; // Too short to be a valid page content
    if (/\{#\{.*?\}#\}/.test(text)) return true; // Font encoding garbage pattern

    // Check for high density of valid characters
    // Valid = alphanumeric, chinese, common punctuation
    const validChars = trimmed.match(/[\u4e00-\u9fa5a-zA-Z0-9\s\.,;!?'"()\[\]]/g)?.length || 0;
    const ratio = validChars / trimmed.length;

    // If less than 50% of characters are "valid", it's likely encoding garbage (e.g. )
    if (ratio < 0.5) {
        console.warn(`Text Quality Check Failed: Valid Ratio ${ratio.toFixed(2)} (< 0.5)`);
        return true;
    }

    return false;
}
