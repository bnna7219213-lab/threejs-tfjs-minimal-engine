import fs from 'fs';
const path = 'C:/Users/bnna7/workspace/makeGameIP/threejs-tfjs-minimal-engine/index.html';
const html = fs.readFileSync(path, 'utf8');
const s = html.indexOf('<script type="module">') + 22;
const e = html.indexOf('</script>');
const js = html.substring(s, e);
try { new Function(js); console.log('JS SYNTAX OK'); }
catch (err) { console.log('JS SYNTAX ERROR:', err.message); process.exit(1); }