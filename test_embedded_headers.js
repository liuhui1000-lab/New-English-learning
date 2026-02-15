// Test embedded header removal
const q1 = `35. <u>enjoyable project</u> it is to build mini robots from recycled materials! A) What a B) What C) How D) What an #### III. Choose the proper words in the box to complete the following passage.`;

const q2 = `51. Some wild animals may ___ forever if we don't stop hunting them. (appear) ### V. Complete the following sentences as required (根据所给要求完成句子。52-57 小题每空格限填一词)`;

// Regex to match embedded headers
const embeddedHeaderRegex = /\s*#{2,}\s*(?:[IVX]+|[A-Z])\.\s+(?:Choose|Complete|Fill|Read|Write|Rewrite|Transform).*/i;

console.log("=== Test Embedded Header Removal ===\n");

console.log("Question 1:");
console.log("Original:", q1);
const match1 = q1.search(embeddedHeaderRegex);
if (match1 !== -1) {
    const cleaned1 = q1.substring(0, match1).trim();
    console.log("Cleaned:", cleaned1);
} else {
    console.log("No header found");
}

console.log("\nQuestion 2:");
console.log("Original:", q2);
const match2 = q2.search(embeddedHeaderRegex);
if (match2 !== -1) {
    const cleaned2 = q2.substring(0, match2).trim();
    console.log("Cleaned:", cleaned2);
} else {
    console.log("No header found");
}
