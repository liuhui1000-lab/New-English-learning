
// New mocked functions based on the updates I just made to parser.ts

function splitQuestions(text: string): string[] {
    const splitRegex = /(?:^|\n|\s{4,})(?:[\(（\[]?\d+[）\)\]]?[\.\,，、])/g;
    const marker = "|||SPLIT|||";
    const textWithMarkers = text.replace(splitRegex, (match) => {
        return marker + match.trim();
    });
    const rawParts = textWithMarkers.split(marker);
    const questions: string[] = [];
    for (const p of rawParts) {
        if (p.trim()) questions.push(p.trim());
    }
    return questions;
}

function classifyQuestion(content: string) {
    let type = 'grammar';
    const tags: string[] = [];

    // Simulating cleanOCRText normalization
    const normalized = content.replace(/_{3,}/g, '______');

    if (
        /对划线部分提问/.test(normalized) ||
        /改写句子/.test(normalized) ||
        /保持句意/i.test(normalized) ||
        /被动语态/i.test(normalized) ||
        /连词成句/i.test(normalized) ||
        /\(.*\)/.test(normalized) && normalized.includes('______') && (normalized.includes('?') || normalized.length > 80)
    ) {
        type = 'sentence_transformation';
    }
    else if (/\(.*\)/.test(normalized) && normalized.includes('______')) {
        const match = normalized.match(/\(([a-zA-Z\s]+)\)\s*$/) || normalized.match(/\(([a-zA-Z\s]+)\)[^\)]*$/);

        if (match) {
            type = 'word_transformation';
            tags.push(`Root:${match[1].trim()}`);
        } else {
            if (normalized.length > 50 && (normalized.includes('?') || normalized.includes('.'))) {
                type = 'word_transformation';
            } else {
                type = 'collocation';
            }
        }
    }
    else if (normalized.includes('______') && !/\([a-zA-Z]+\)$/.test(normalized.trim())) {
        type = 'collocation';
    }
    else if (/A\..*B\./.test(normalized)) {
        type = 'grammar';
    }

    return { type, content, tags };
}

// Test Cases
const testCases = {
    inlineMerged: `21. The app is useful. A) a B) an    22. All guests showed up. A) they B) them    23. Sam has a dream.`,
    sentenceRewrite: `57. My puppy weighed $ \\underline{\\text{about 1.5 kilograms}} $ when he was born. (对划线部分提问)\n______ ______ did your puppy weigh?`,
    wordTrans: `46. The art class students can ______ the tools. (operation)`
};

console.log("--- TEST 1: Inline Merged ---");
const splitResult = splitQuestions(testCases.inlineMerged);
console.log(`Split count: ${splitResult.length} (Expected 3)`);
splitResult.forEach((q, i) => console.log(`[${i}] ${q.substring(0, 30)}`));

console.log("\n--- TEST 2: Rewrite Classification ---");
const rwResult = classifyQuestion(testCases.sentenceRewrite);
console.log(`Classified: ${rwResult.type} (Expected: sentence_transformation)`);

console.log("\n--- TEST 3: Word Trans Classification ---");
const wtResult = classifyQuestion(testCases.wordTrans);
console.log(`Classified: ${wtResult.type} (Expected: word_transformation)`);
if (wtResult.tags.length > 0) console.log(`Tags: ${wtResult.tags}`);
