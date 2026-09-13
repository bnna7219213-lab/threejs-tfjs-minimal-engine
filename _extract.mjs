import { readFileSync, writeFileSync } from 'fs';
const h = readFileSync('C:/Users/bnna7/workspace/makeGameIP/threejs-tfjs-minimal-engine/index.html', 'utf8');
const s = h.lastIndexOf('<script type="module">') + 22;
const e = h.lastIndexOf('</script>');
const js = h.substring(s, e);
writeFileSync('C:/Users/bnna7/workspace/makeGameIP/threejs-tfjs-minimal-engine/_js_out.mjs', js);
console.log(`Written ${js.length} bytes`);