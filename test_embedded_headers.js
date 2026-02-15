// Test embedded header removal with ## Part 2
const q1 = `25. Stories about supernatural beings offer a ___ into amazing new worlds. ## Part 2 Phonetics, Vocabulary and Grammar (第二部分 语音、词汇和语法)`;

const q2 = `35. <u>enjoyable project</u> it is to build mini robots! #### III. Choose the proper words`;

const q3 = `51. Some wild animals may ___ forever if we don't stop hunting them. (appear) ### V. Complete the following sentences`;

// Updated regex to match Part X patterns
const embeddedHeaderRegex = /\s*#{0,}\s*(?:(?:[IVX]+|[A-Z])\.\s+(?:Choose|Complete|Fill|Read|Write|Rewrite|Transform)|Part\s+\d+)[^\n]*/i;

console.log("=== Test Embedded Header Removal ===\n");

console.log("Question 1 (## Part 2):");
console.log("Original:", q1);
const match1 = q1.search(embeddedHeaderRegex);
if (match1 !== -1) {
    const cleaned1 = q1.substring(0, match1).trim();
    console.log("Cleaned:", cleaned1);
    console.log("✅ PASS\n");
} else {
    console.log("❌ FAIL: No header found\n");
}

console.log("Question 2 (#### III. Choose):");
console.log("Original:", q2);
const match2 = q2.search(embeddedHeaderRegex);
if (match2 !== -1) {
    const cleaned2 = q2.substring(0, match2).trim();
    console.log("Cleaned:", cleaned2);
    console.log("✅ PASS\n");
} else {
    console.log("❌ FAIL: No header found\n");
}

console.log("Question 3 (### V. Complete):");
console.log("Original:", q3);
const match3 = q3.search(embeddedHeaderRegex);
if (match3 !== -1) {
    const cleaned3 = q3.substring(0, match3).trim();
    console.log("Cleaned:", cleaned3);
    console.log("✅ PASS");
} else {
    console.log("❌ FAIL: No header found");
}
