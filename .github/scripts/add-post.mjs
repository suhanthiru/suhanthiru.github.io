// Adds one feed post (from a GitHub issue opened by the quick-post page) to posts.json.
// It only ever prepends a new post. Existing posts are never edited or removed.
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";

const FILE = "posts.json";
const SOURCES = ["linkedin", "x", "instagram", "threads", "bluesky", "youtube", "tiktok", "substack", "other"];

function fail(msg) {
  console.error(msg);
  if (process.env.RUNNER_TEMP) appendFileSync(join(process.env.RUNNER_TEMP, "post-error.txt"), msg);
  process.exit(1);
}
function detect(url) {
  const u = url.toLowerCase();
  if (u.includes("linkedin.com")) return "linkedin";
  if (/(^|\/\/|\.)(x|twitter)\.com/.test(u)) return "x";
  if (u.includes("instagram.com")) return "instagram";
  if (u.includes("threads.net") || u.includes("threads.com")) return "threads";
  if (u.includes("bsky.app")) return "bluesky";
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.includes("tiktok.com")) return "tiktok";
  if (u.includes("substack.com")) return "substack";
  return "other";
}

const body = process.env.ISSUE_BODY || "";
const number = process.env.ISSUE_NUMBER;
if (!/^\d+$/.test(number || "")) fail("Missing issue number.");
const created = (process.env.ISSUE_CREATED || new Date().toISOString()).slice(0, 10);

const m = /```json\s*([\s\S]*?)```/.exec(body);
if (!m) fail("No post data was found in the issue.");
let input;
try { input = JSON.parse(m[1]); } catch { fail("The post data isn't valid JSON."); }

const text = typeof input.text === "string" ? input.text.replace(/\r/g, "").trim() : "";
if (!text) fail("The post is empty.");
if (text.length > 5000) fail("The post is longer than 5,000 characters.");
const url = typeof input.url === "string" ? input.url.trim() : "";
if (url && !/^https?:\/\/\S+$/i.test(url)) fail("The link must start with http:// or https://.");
const source = SOURCES.includes(input.source) ? input.source : detect(url);
const date = /^\d{4}-\d{2}-\d{2}$/.test(input.date || "") ? input.date : created;

const posts = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : [];
if (!Array.isArray(posts)) fail("posts.json is not a list, so it was left unchanged.");

const id = "gh" + number;
if (posts.some((p) => p && p.id === id)) {
  console.log(`Post ${id} is already in posts.json.`);
  process.exit(0);
}

const post = { id, date, source, url, text };
writeFileSync(FILE, JSON.stringify([post, ...posts], null, 2) + "\n");
console.log(`Added ${id} (${source}, ${date}).`);
