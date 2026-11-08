// Content rules shared by the editor page (/post/) and the publish workflow.
// Everything a publish can change goes through applyUpdate(), which cleans every field,
// so the workflow writes exactly what the editor previewed and nothing else.

export const PLATFORMS = ["linkedin", "x", "instagram", "threads", "bluesky", "github", "youtube", "tiktok", "substack", "website", "other"];
export const SOURCES = ["linkedin", "x", "instagram", "threads", "bluesky", "youtube", "tiktok", "substack", "other"];

const str = (v, max) => (typeof v === "string" ? v : v == null ? "" : String(v)).slice(0, max);
const httpUrl = (v) => { const s = str(v, 2000).trim(); return /^https?:\/\/\S+$/i.test(s) ? s : ""; };
const isoDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : "");
export const isId = (v) => typeof v === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(v);
const idOr = (v) => (isId(v) ? v : "");
const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
const clone = (x) => JSON.parse(JSON.stringify(x));
const IMG_PATH = /^images\/[A-Za-z0-9_-]{1,40}\.(jpg|jpeg|png|webp)$/;

export function cleanProfile(p) {
  p = p || {};
  return { name: str(p.name, 120).trim(), tagline: str(p.tagline, 300), about: str(p.about, 20000), email: str(p.email, 200).trim(), avatar: idOr(p.avatar) };
}
export function cleanLink(l) {
  l = l || {};
  return { platform: PLATFORMS.includes(l.platform) ? l.platform : "other", handle: str(l.handle, 120).trim(), url: httpUrl(l.url) };
}
export function cleanTimeline(t) {
  t = t || {};
  return { when: str(t.when, 60), title: str(t.title, 200), detail: str(t.detail, 600), current: !!t.current };
}
export function cleanProject(p) {
  p = p || {};
  return {
    id: idOr(p.id), title: str(p.title, 200), year: str(p.year, 20), blurb: str(p.blurb, 1000),
    tags: list(p.tags, 12).map((t) => str(t, 40).trim()).filter(Boolean), url: httpUrl(p.url),
    body: str(p.body, 200000), photos: list(p.photos, 60).filter(isId), hidden: !!p.hidden
  };
}
export function cleanEssay(e) {
  e = e || {};
  return { id: idOr(e.id), title: str(e.title, 200), subtitle: str(e.subtitle, 400), date: isoDate(e.date), cover: idOr(e.cover), body: str(e.body, 300000), hidden: !!e.hidden };
}
export function cleanPost(p) {
  p = p || {};
  return { id: idOr(p.id), date: isoDate(p.date), source: SOURCES.includes(p.source) ? p.source : "other", url: httpUrl(p.url), text: str(p.text, 5000), photo: idOr(p.photo) };
}
function cleanPhoto(ph, id) {
  ph = ph || {};
  return { src: IMG_PATH.test(ph.src || "") ? ph.src : `images/${id}.jpg`, caption: str(ph.caption, 300) };
}
function uniqueById(arr, clean) {
  const seen = new Set();
  return list(arr, 2000).map(clean).filter((x) => x.id && !seen.has(x.id) && seen.add(x.id));
}

export function normalizeContent(c) {
  c = c && typeof c === "object" ? c : {};
  const photos = {};
  for (const [id, ph] of Object.entries(c.photos || {})) if (isId(id) && ph) photos[id] = cleanPhoto(ph, id);
  return {
    rev: Number(c.rev) || 0,
    profile: cleanProfile(c.profile),
    links: list(c.links, 40).map(cleanLink).filter((l) => l.url || l.handle),
    timeline: list(c.timeline, 100).map(cleanTimeline).filter((t) => t.title || t.when),
    projects: uniqueById(c.projects, cleanProject),
    essays: uniqueById(c.essays, cleanEssay),
    photos
  };
}
export function normalizePosts(p) { return uniqueById(p, cleanPost); }

export function photoRefs(text) { return [...String(text || "").matchAll(/photo:([A-Za-z0-9_-]+)/g)].map((m) => m[1]); }
export function referencedPhotos(content, posts) {
  const used = new Set();
  const add = (id) => { if (id) used.add(id); };
  add(content.profile.avatar); photoRefs(content.profile.about).forEach(add);
  for (const p of content.projects) { p.photos.forEach(add); photoRefs(p.body).forEach(add); }
  for (const e of content.essays) { add(e.cover); photoRefs(e.body).forEach(add); }
  for (const p of posts) add(p.photo);
  return used;
}

function upsertDelete(arr, ops, clean) {
  if (!ops || typeof ops !== "object") return arr;
  const del = new Set(list(ops.delete, 2000).filter(isId));
  const out = arr.filter((x) => !del.has(x.id));
  for (const raw of list(ops.upsert, 2000).reverse()) {
    const item = clean(raw);
    if (!item.id) continue;
    const i = out.findIndex((x) => x.id === item.id);
    if (i >= 0) out[i] = item; else out.unshift(item);
  }
  return out;
}

// Applies one published update to the current site files.
// Returns the new content.json and posts.json data plus the image files to write and remove.
export function applyUpdate(content, posts, u) {
  const c = normalizeContent(clone(content || {}));
  let p = normalizePosts(posts || []);
  u = u && typeof u === "object" ? u : {};
  if (u.profile) c.profile = cleanProfile(u.profile);
  if (u.links) c.links = list(u.links, 40).map(cleanLink).filter((l) => l.url || l.handle);
  if (u.timeline) c.timeline = list(u.timeline, 100).map(cleanTimeline).filter((t) => t.title || t.when);
  c.projects = upsertDelete(c.projects, u.projects, cleanProject);
  c.essays = upsertDelete(c.essays, u.essays, cleanEssay);
  p = upsertDelete(p, u.posts, cleanPost);
  if (Array.isArray(u.projectOrder)) {
    const pos = new Map(u.projectOrder.filter(isId).map((id, i) => [id, i]));
    c.projects = c.projects.map((x, i) => [x, pos.has(x.id) ? pos.get(x.id) : -1, i])
      .sort((a, b) => a[1] - b[1] || a[2] - b[2]).map((x) => x[0]);
  }

  const newImages = {};
  for (const ph of list(u.photos && u.photos.upsert, 500)) {
    if (!ph || !isId(ph.id)) continue;
    const prev = c.photos[ph.id];
    const hasData = typeof ph.data === "string" && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(ph.data);
    if (!prev && !hasData) continue;
    if (hasData) newImages[ph.id] = ph.data;
    c.photos[ph.id] = { src: hasData ? `images/${ph.id}.jpg` : prev.src, caption: str(ph.caption, 300) };
  }

  // Point only at photos that exist, then drop photos nothing points at.
  const has = (id) => !!c.photos[id];
  if (!has(c.profile.avatar)) c.profile.avatar = "";
  for (const x of c.projects) x.photos = x.photos.filter(has);
  for (const x of c.essays) if (!has(x.cover)) x.cover = "";
  for (const x of p) if (!has(x.photo)) x.photo = "";
  const used = referencedPhotos(c, p);
  const removedImages = [];
  for (const id of Object.keys(c.photos)) {
    if (!used.has(id)) { removedImages.push(c.photos[id].src); delete c.photos[id]; delete newImages[id]; }
  }
  return { content: c, posts: p, newImages, removedImages };
}

// What changed between the published site (base) and the editor (cur).
// Both use the flat editor shape: { profile, links, timeline, projects, essays, photos, posts }.
export function diff(base, cur) {
  const u = {};
  const same = (a, b, clean) => JSON.stringify(clean(a)) === JSON.stringify(clean(b));
  if (!same(base.profile, cur.profile, cleanProfile)) u.profile = cleanProfile(cur.profile);
  const linksOf = (x) => x.links.map(cleanLink).filter((l) => l.url || l.handle);
  if (JSON.stringify(linksOf(base)) !== JSON.stringify(linksOf(cur))) u.links = linksOf(cur);
  const tlOf = (x) => x.timeline.map(cleanTimeline).filter((t) => t.title || t.when);
  if (JSON.stringify(tlOf(base)) !== JSON.stringify(tlOf(cur))) u.timeline = tlOf(cur);
  for (const [k, clean] of [["projects", cleanProject], ["essays", cleanEssay], ["posts", cleanPost]]) {
    const before = new Map(base[k].map((x) => [x.id, x]));
    const now = new Set(cur[k].map((x) => x.id));
    const upsert = cur[k].filter((x) => !before.has(x.id) || !same(before.get(x.id), x, clean)).map(clean);
    const del = base[k].filter((x) => !now.has(x.id)).map((x) => x.id);
    if (upsert.length || del.length) u[k] = { upsert, delete: del };
  }
  const order = (x) => x.projects.map((p) => p.id).join(",");
  if (order(base) !== order(cur)) u.projectOrder = cur.projects.map((p) => p.id);

  const curContent = { profile: cleanProfile(cur.profile), projects: cur.projects.map(cleanProject), essays: cur.essays.map(cleanEssay) };
  const used = referencedPhotos(curContent, cur.posts.map(cleanPost));
  const photos = [];
  for (const [id, ph] of Object.entries(cur.photos)) {
    if (!used.has(id)) continue;
    const b = base.photos[id];
    const isNew = (ph.src || "").startsWith("data:");
    if (!b || isNew) photos.push({ id, caption: str(ph.caption, 300), data: ph.src });
    else if ((b.caption || "") !== (ph.caption || "")) photos.push({ id, caption: str(ph.caption, 300) });
  }
  if (photos.length) u.photos = { upsert: photos };
  return u;
}

// Removes from `pending` everything that `done` already published.
export function subtract(pending, done) {
  const out = clone(pending || {});
  for (const k of ["profile", "links", "timeline", "projectOrder"]) if (done[k]) delete out[k];
  for (const k of ["projects", "essays", "posts"]) {
    if (!out[k] || !done[k]) continue;
    const ids = new Set([...done[k].upsert.map((x) => x.id), ...done[k].delete]);
    out[k].upsert = out[k].upsert.filter((x) => !ids.has(x.id));
    out[k].delete = out[k].delete.filter((id) => !ids.has(id));
    if (!out[k].upsert.length && !out[k].delete.length) delete out[k];
  }
  if (out.photos && done.photos) {
    const ids = new Set(done.photos.upsert.map((x) => x.id));
    out.photos.upsert = out.photos.upsert.filter((x) => !ids.has(x.id));
    if (!out.photos.upsert.length) delete out.photos;
  }
  return out;
}

export function describe(u) {
  const out = [];
  const n = (k, one, many) => { const c = u[k] ? u[k].upsert.length + u[k].delete.length : 0; if (c) out.push(`${c} ${c === 1 ? one : many}`); };
  if (u.profile) out.push("Who I am");
  if (u.timeline) out.push("Timeline");
  if (u.links) out.push("Social");
  n("posts", "post", "posts");
  n("projects", "project", "projects");
  if (u.projectOrder && !u.projects) out.push("Project order");
  n("essays", "essay", "essays");
  const ph = u.photos ? u.photos.upsert.length : 0;
  if (ph && !out.length) out.push(`${ph} photo${ph === 1 ? "" : "s"}`);
  return out;
}
