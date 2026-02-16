// Test if the regex matches the actual text format
const text = `58. are good for, fruits and vegetables, to keep healthy, people, fresh (连词成句) ___
# Part 3 Reading and Writing (第三部分 读写)
### VI. Reading comprehension (阅读理解)`;

// Current regex from parser
const regex1 = /(?:^|\n|\s{3,}|[\.\!\?]\s+)(?:Part\s*(?:[IVX]+|\d+|[A-Z])\.?|[IVX]+\.|[A-Z]\.)\s*Reading\s*(?:and|&)\s*Writing/i;
const regex2 = /(?:^|\n)\s*Reading\s*(?:and|&)\s*Writing/i;

console.log("=== Test Current Regex ===");
console.log("Text:", text);
console.log("\nRegex 1 match:", text.match(regex1));
console.log("Regex 2 match:", text.match(regex2));

// The issue: "# Part 3" has a "#" before "Part"
// Our regex expects "Part" at the start or after newline/spaces
// But "# Part" doesn't match because of the "#"

// Fixed regex: Allow optional "#" symbols before "Part"
const fixedRegex = /(?:^|\n)\s*#{0,6}\s*(?:Part\s*(?:[IVX]+|\d+|[A-Z])\.?|[IVX]+\.|[A-Z]\.)\s*Reading\s*(?:and|&)\s*Writing/i;

console.log("\n=== Test Fixed Regex ===");
const match = text.match(fixedRegex);
console.log("Fixed regex match:", match);
if (match) {
    console.log("Match index:", text.indexOf(match[0]));
    console.log("Matched text:", match[0]);
}
