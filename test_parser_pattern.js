// 测试 parser 的 endPattern 是否能正确匹配 "Part 3 Reading and Writing"

const testCases = [
    "Part 3 Reading and Writing",
    "Part III Reading and Writing",
    "Part3 Reading and Writing",
    "Part  3  Reading  and  Writing",
    "\nPart 3 Reading and Writing",
    "   Part 3 Reading and Writing",
];

const endPattern = /(?:^|\n|\s{3,}|[\.!\?]\s+)(?:Part\s*(?:[IVX]+|\d+|[A-Z])\.?|[IVX]+\.|[A-Z]\.)\s*Reading\s*(?:and|&)\s*Writing/i;

console.log("Testing endPattern matching:\n");

testCases.forEach((test, idx) => {
    const match = test.search(endPattern);
    console.log(`Test ${idx + 1}: "${test}"`);
    console.log(`  Match index: ${match}`);
    console.log(`  Matched: ${match !== -1 ? "✓ YES" : "✗ NO"}`);
    console.log();
});

// 测试实际文本场景
const sampleText = `
II. Grammar and Vocabulary

Choose the best answer.

1. He ___ to school every day.
   A. go  B. goes  C. going  D. gone

2. She is good ___ math.
   A. at  B. in  C. on  D. with

Part 3 Reading and Writing

Read the following passage and answer the questions.

The quick brown fox jumps over the lazy dog.
`;

console.log("=".repeat(50));
console.log("Testing with sample text:");
console.log("=".repeat(50));

const matchIndex = sampleText.search(endPattern);
console.log(`Match found at index: ${matchIndex}`);
if (matchIndex !== -1) {
    const beforeMatch = sampleText.substring(0, matchIndex);
    const afterMatch = sampleText.substring(matchIndex);
    console.log("\n--- Text BEFORE match (should be kept) ---");
    console.log(beforeMatch);
    console.log("\n--- Text AFTER match (should be discarded) ---");
    console.log(afterMatch);
} else {
    console.log("❌ Pattern did NOT match!");
}
