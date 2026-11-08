// Applies a site update sent from /post/ as comments on a GitHub issue.
// Writes only content.json, posts.json and images/<id>.jpg.
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { applyUpdate } from "../../post/apply.mjs";

const { GH_TOKEN, ISSUE_NUMBER, REPO, OWNER, RUNNER_TEMP } = process.env;

function fail(msg) {
  console.error(msg);
  if (RUNNER_TEMP) appendFileSync(join(RUNNER_TEMP, "update-error.txt"), msg);
  process.exit(1);
}

async function getAll(url) {
  const out = [];
  while (url) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" } });
    if (!r.ok) fail(`Couldn't read the issue comments (GitHub said ${r.status}).`);
    out.push(...(await r.json()));
    const next = /<([^>]+)>;\s*rel="next"/.exec(r.headers.get("link") || "");
    url = next ? next[1] : null;
  }
  return out;
}

// Reassemble the update from its numbered parts.
const comments = await getAll(`https://api.github.com/repos/${REPO}/issues/${ISSUE_NUMBER}/comments?per_page=100`);
const parts = [];
let total = 0;
for (const c of comments) {
  if (!c.user || c.user.login !== OWNER) continue;
  const m = /^<!-- site-(part|final) (\d+)\/(\d+) -->\r?\n([\s\S]*?)\r?\n<!-- end -->\s*$/.exec(c.body || "");
  if (!m) continue;
  parts[Number(m[2]) - 1] = m[4];
  total = Number(m[3]);
}
if (!total || parts.length !== total || parts.some((p) => p === undefined)) fail("Some parts of the update are missing. Publish again.");
let update;
try { update = JSON.parse(parts.join("")); } catch { fail("The update couldn't be read. Publish again."); }
if (!update || update.v !== 1) fail("This update came from an older version of the editor. Reload /post/ and publish again.");

const read = (f, fallback) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : fallback);
const result = applyUpdate(read("content.json", {}), read("posts.json", []), update);
result.content.rev = Number(ISSUE_NUMBER);

for (const [id, data] of Object.entries(result.newImages)) {
  const buf = Buffer.from(data.slice(data.indexOf(",") + 1), "base64");
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) fail(`Photo ${id} isn't a valid JPEG.`);
  if (buf.length > 4 * 1024 * 1024) fail(`Photo ${id} is larger than 4 MB.`);
  mkdirSync("images", { recursive: true });
  writeFileSync(`images/${id}.jpg`, buf);
}
for (const src of result.removedImages) {
  if (/^images\/[A-Za-z0-9_-]{1,40}\.(jpg|jpeg|png|webp)$/.test(src) && existsSync(src)) unlinkSync(src);
}
writeFileSync("content.json", JSON.stringify(result.content, null, 2) + "\n");
writeFileSync("posts.json", JSON.stringify(result.posts, null, 2) + "\n");
console.log(`Applied update #${ISSUE_NUMBER}: ${Object.keys(result.newImages).length} new photo(s), ${result.removedImages.length} removed.`);
