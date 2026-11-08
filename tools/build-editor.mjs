// Builds editor/site-editor.html from editor/editor.src.html.
// The site's index.html (with its content block emptied) is embedded as the
// template the editor fills in when you download a new index.html.
// Run after changing index.html's design:  node tools/build-editor.mjs
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const site = readFileSync(new URL("index.html", root), "utf8");
const block = /(<script type="application\/json" id="site-content">)([\s\S]*?)(<\/script>)/;
if (!block.test(site)) throw new Error('index.html has no <script type="application/json" id="site-content"> block');
const template = site.replace(block, (_, open, _body, close) => open + "__SITE_CONTENT__" + close);

const src = readFileSync(new URL("editor/editor.src.html", root), "utf8");
const marker = '/*__TEMPLATE__*/""';
if (!src.includes(marker)) throw new Error("editor.src.html is missing the template marker");
const literal = JSON.stringify(template)
  .replace(/</g, "\\u003c")
  .replace(new RegExp(String.fromCharCode(0x2028), "g"), "\\u2028")
  .replace(new RegExp(String.fromCharCode(0x2029), "g"), "\\u2029");
const out = src.replace(marker, () => literal);
writeFileSync(new URL("editor/site-editor.html", root), out);
console.log(`editor/site-editor.html written (${(out.length / 1024).toFixed(0)} KB)`);
