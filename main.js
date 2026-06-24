const args = process.argv.slice(2);
const greeting = args[0] || 'World';

console.log(`Hey there, ${greeting}!`);
console.log('Running on Node.js', process.version);
console.log('Current directory:', process.cwd());
