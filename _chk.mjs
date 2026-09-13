#!/usr/bin/env node
import { readFileSync } from 'fs';
const h = readFileSync('C:/Users/bnna7/workspace/makeGameIP/threejs-tfjs-minimal-engine/index.html', 'utf8');
const s = h.lastIndexOf('<script type="module">') + 22;
const e = h.lastIndexOf('</script>');
const js = h.substring(s, e);
try { new Function(js); console.log('JS SYNTAX OK'); }
catch (err) { console.log('JS SYNTAX ERROR:', err.message); process.exit(1); }