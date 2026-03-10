const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Parse .env
const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        env[match[1]] = match[2].trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
    }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
    console.log('Fetching user "laman"...');
    const { data: users, error: ue } = await supabase.from('profiles').select('*').eq('username', 'laman');
    if (ue || !users || users.length === 0) {
        console.error('User not found or error:', ue);
        return;
    }
    const uid = users[0].id;

    console.log('Fetching quiz_results...');
    const { data: quiz, error: qe } = await supabase.from('quiz_results').select('id, question_id, is_correct, attempt_at, questions(type, content)').eq('user_id', uid);
    if (qe) console.error(qe);
    else {
        console.log('Quiz Results count:', quiz.length);
        const typesCount = {};
        quiz.forEach(q => {
            const t = q.questions?.type || 'unknown';
            typesCount[t] = (typesCount[t] || 0) + 1;
        });
        console.log('Quiz Types breakdown:', typesCount);
        const wordTrans = quiz.filter(q => q.questions?.type === 'word_transformation');
        const sentenceTrans = quiz.filter(q => q.questions?.type === 'sentence_transformation');
        console.log('Word Trans in quiz_results:', wordTrans.length, wordTrans.slice(0, 1));
        console.log('Sentence Trans in quiz_results:', sentenceTrans.length, sentenceTrans.slice(0, 1));
    }

    console.log('---');
    console.log('Fetching user_progress...');
    const { data: up, error: pe } = await supabase.from('user_progress').select('*, questions!inner(type, content)').eq('user_id', uid).in('questions.type', ['sentence_transformation', 'word_transformation', 'vocabulary']);
    if (pe) console.error(pe);
    else {
        console.log('User Progress count:', up.length);
        const typesCount = {};
        up.forEach(u => {
            const t = u.questions?.type || 'unknown';
            typesCount[t] = (typesCount[t] || 0) + 1;
        });
        console.log('Progress Types breakdown:', typesCount);

        const sentenceTrans = up.filter(u => u.questions?.type === 'sentence_transformation');
        console.log('Sentence Trans in user_progress:', sentenceTrans.length);
        if (sentenceTrans.length > 0) {
            console.log('Sample Sentence Trans in user_progress:', sentenceTrans.slice(0, 2).map(x => ({
                content: x.questions.content,
                attempts: x.attempts,
                next_review_at: x.next_review_at,
                status: x.status
            })));
        }
    }
}
run();
