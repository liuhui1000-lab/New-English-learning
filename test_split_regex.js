// Test the new splitQuestions implementation
const text = `Part 2 Grammar and Vocabulary
II. Choose the best answer
21. ___ film Ne Zha 2, made by a group of Chinese, was a big success.
A) A B) An C) The D) / 22. —Where did you get the toy car?
—Come on, we made it ____.
A) we B) us C) our D) ourselves 23. Lily and Lucy had a lot of homework to do, so ____ of them went to the park.
A) both B) neither C) either D) none`;

// Simulate the new function
function splitQuestions(text) {
    const sectionHeaderRegex = /(?:^|\n)\s*(?:#{2,}\s*)?(?:Part\s+[A-Z]|Section\s+[A-Z]|[IVX]+\.\s+.*|[A-Z]\.\s+(?:Read|Complete|Fill|Choose|Section|Listen).*?|Choose\s+the\s+best\s+answer.*?)(?:\n|$)/gi;
    let cleanText = text.replace(sectionHeaderRegex, '\n');

    const parts = cleanText.split(/(\d+\.)/);

    const questions = [];
    let currentQuestion = '';

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i].trim();
        if (!part) continue;

        if (/^\d+\.$/.test(part)) {
            if (currentQuestion) {
                questions.push(currentQuestion.trim());
            }
            currentQuestion = part;
        } else {
            if (currentQuestion) {
                currentQuestion += ' ' + part;
            }
        }
    }

    if (currentQuestion) {
        questions.push(currentQuestion.trim());
    }

    return questions.filter(q => {
        if (q.length < 10) return false;
        if (!/^\d+\./.test(q)) return false;
        if (/^[IVX]+\.\s/.test(q) && q.length < 100) return false;
        return true;
    });
}

console.log("=== New splitQuestions Test ===");
const questions = splitQuestions(text);
console.log(`\nFound ${questions.length} questions:\n`);
questions.forEach((q, i) => {
    console.log(`--- Question ${i + 1} ---`);
    console.log(q.substring(0, 150));
    console.log();
});
