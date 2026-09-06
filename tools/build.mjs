import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** A deliberately small static-ESM packer. Only our named relative imports are accepted.
 * Unsupported syntax is rejected, never silently mangled. No registry/CDN/build dependency. */
const compiled = new Map(), visiting = new Set(), chunks = [];
async function compile(filename) {
  filename = path.resolve(filename);
  if (!filename.startsWith(path.join(root, 'src') + path.sep)) throw Error('Imports must stay under src/');
  if (compiled.has(filename)) return compiled.get(filename);
  if (visiting.has(filename)) throw Error('Circular dependency: ' + filename);
  visiting.add(filename);
  let source = await fs.readFile(filename, 'utf8');
  const imports = [...source.matchAll(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?\s*$/gm)];
  for (const m of imports) {
    const dependency = await compile(path.resolve(path.dirname(filename), m[2]));
    if (!/^[\w\s,]+$/.test(m[1])) throw Error('Unsupported import specifier: ' + m[1]);
    source = source.replace(m[0], `const {${m[1]}} = ${dependency};`);
  }
  if (/^\s*import\s/m.test(source)) throw Error('Unsupported import syntax in ' + filename);
  const exports = [...source.matchAll(/^export\s+(?:class|function|const|let)\s+(\w+)/gm)].map(m => m[1]);
  source = source.replace(/^export\s+(?=class|function|const|let)/gm, '');
  if (/^\s*export\s/m.test(source)) throw Error('Unsupported export syntax in ' + filename);
  const id = `module_${compiled.size}`;
  // Validate each module before concatenating, then validate the completed script too.
  new vm.Script(`(()=>{${source}\n})`, { filename });
  chunks.push(`// ${path.relative(root, filename)}\nconst ${id} = (() => {\n${source}\nreturn { ${exports.join(', ')} };\n})();\n`);
  compiled.set(filename, id); visiting.delete(filename); return id;
}
await compile(path.join(root, 'src/main.js'));
const bundle = `'use strict';\n(()=>{\n${chunks.join('\n')}\n})();`;
new vm.Script(bundle, { filename: 'nightmarket.bundle.js' });
let html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
const css = await fs.readFile(path.join(root, 'public/styles.css'), 'utf8');
const favicon = await fs.readFile(path.join(root, 'assets/icon.svg'), 'utf8');
html = html.replace('<link rel="stylesheet" href="public/styles.css">', `<style>\n${css}\n</style>`)
  .replace('href="assets/icon.svg"', `href="data:image/svg+xml;base64,${Buffer.from(favicon).toString('base64')}"`)
  .replace('<script type="module" src="src/main.js"></script>', `<script>\n${bundle.replace(/<\/script/gi, '<\\/script')}\n</script>`);
await fs.mkdir(path.join(root, 'dist'), { recursive: true });
await fs.writeFile(path.join(root, 'dist/index.html'), html);
await fs.writeFile(path.join(root, 'dist/BUILD.json'), JSON.stringify({ name: 'miaotan-nightmarket', version: '1.0.0', modules: compiled.size, externalRuntimeRequests: 0, bytes: Buffer.byteLength(html), sha256: crypto.createHash('sha256').update(html).digest('hex') }, null, 2));
console.log(`Build OK: ${compiled.size} source modules → dist/index.html (${Buffer.byteLength(html)} bytes). Zero runtime dependencies; double-click/offline supported.`);
