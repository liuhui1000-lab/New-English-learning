
const vars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY'
];

console.log('--- Environment Variable Check ---');
vars.forEach(v => {
    const val = process.env[v];
    console.log(`${v}: ${val ? 'PRESENT (length: ' + val.length + ')' : 'MISSING'}`);
});
console.log('--- End of Check ---');
