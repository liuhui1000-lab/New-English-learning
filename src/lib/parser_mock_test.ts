
const testCases = [
    "1. apply(v) 申请; 应用",           // Case 1: No space before paren
    "bake (v.) 烘焙-baker (n.) 烘焙师-bakery (n.) 烘焙坊", // Case 2: Hyphen splitting
    "45. bath (n.) - bathe (v.)洗澡    have/take a bath 沐浴" // Case 3: Phrase separation
];

console.log("--- Starting Parser Mock Test ---");

function mockParse(lines: string[]) {
    lines.forEach(line => {
        let normalizedLine = line.trim();
        if (!normalizedLine) return;

        console.log(`\n\n=== Processing Line: "${normalizedLine}" ===`);

        // Step 0: Block Splitting (Wide Spaces)
        const blocks = normalizedLine.split(/\s{2,}|\t+/);

        blocks.forEach((block, bIdx) => {
            if (!block.trim()) return;
            console.log(`\n-> Block ${bIdx + 1}: "${block}"`);

            // Step 1: Family Splitting (Hyphen)
            // Splitting by hyphen that might be surrounded by spaces or not.
            const parts = block.split(/\s*[-–]\s*/).map(p => p.trim()).filter(p => p.length > 0);

            parts.forEach((part, pIdx) => {
                // Step 2: Item Parsing
                // Try Strict Regex first
                // Added ? in \d+ group just in case.
                // Critical change: `\s*` before POS group `(\([a-z\.]+\))` handled by `\s*`.
                const strictMatch = part.match(/^(\d+[\.\s]*)?([a-zA-Z\-\s]+?)\s*(\([a-z\.]+\))\s*(.+)$/);

                // Fallback Regex
                const fallbackMatch = part.match(/^(\d+[\.\s]*)?([a-zA-Z\-\s]+)\s+(.+)$/);

                if (strictMatch) {
                    const word = strictMatch[2].trim();
                    const rawPos = strictMatch[3].replace(/[\(\)]/g, '');
                    const def = strictMatch[4].trim();
                    console.log(`   [STRICT MATCH] Word: "${word}" | POS: "${rawPos}" | Def: "${def}"`);
                } else if (fallbackMatch) {
                    const word = fallbackMatch[2].trim();
                    const def = fallbackMatch[3].trim();
                    console.log(`   [FALLBACK MATCH] Word: "${word}" | Def: "${def}"`);
                } else {
                    console.log(`   [FAILED] Part: "${part}"`);
                    // Debugging why it failed
                    const posCheck = part.match(/\([a-zA-Z\.]+\)/);
                    if (posCheck) {
                        console.log(`      -> POS detected "${posCheck[0]}" but regex failed. Check spacing or word characters.`);
                    } else {
                        console.log(`      -> No POS detected.`);
                    }
                }
            });
        });
    });
}

mockParse(testCases);
