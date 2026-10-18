// Refreshes data.json with live GitHub numbers for kabirv.me.
// Runs daily from .github/workflows/update-stats.yml. Needs GITHUB_TOKEN.
import { writeFile, readFile } from "node:fs/promises";

const USER = "kabirvashisht4-glitch";
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) { console.error("GITHUB_TOKEN is not set"); process.exit(1); }

// Keep these in sync with the "rows" list in index.html.
const SCOPES = [
  "org:NVIDIA-NeMo", "org:json-schema-org", "repo:sktime/skpro", "org:sagemath",
  "org:Tracer-Cloud", "org:open-telemetry", "repo:PrithvijitBose/Proofly",
  "org:c2siorg", "org:SakanaAI",
];

const headers = { Authorization: `Bearer ${TOKEN}`, "User-Agent": "kabirv-stats", Accept: "application/vnd.github+json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", { method: "POST", headers, body: JSON.stringify({ query, variables }) });
  const j = await res.json();
  if (!res.ok || j.errors) throw new Error("GraphQL: " + JSON.stringify(j.errors || j));
  return j.data;
}

async function count(q) {
  const url = "https://api.github.com/search/issues?per_page=1&q=" + encodeURIComponent(q);
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers });
    if (res.ok) { await sleep(2200); return (await res.json()).total_count; }
    if (res.status === 403 || res.status === 429) { await sleep(30000); continue; }
    throw new Error(`Search failed (${res.status}) for: ${q}`);
  }
  throw new Error("Search rate-limited for: " + q);
}

const cal = await gql(`query($login:String!){ user(login:$login){ contributionsCollection { contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } } } } }`, { login: USER });
const calendar = cal.user.contributionsCollection.contributionCalendar;
const days = {};
let last = "";
for (const w of calendar.weeks) for (const d of w.contributionDays) {
  if (d.contributionCount > 0) days[d.date] = d.contributionCount;
  if (d.date > last) last = d.date;
}

const base = `author:${USER} type:pr -user:${USER}`;
const merged = await count(`${base} is:merged`);
const open = await count(`${base} is:open`);
const issues = await count(`author:${USER} type:issue -user:${USER}`);
const orgs = {};
for (const s of SCOPES) {
  orgs[s] = { merged: await count(`author:${USER} type:pr is:merged ${s}`), open: await count(`author:${USER} type:pr is:open ${s}`) };
}

const data = { updated: last, total: calendar.totalContributions, merged, open, issues, orgs, days };
const out = JSON.stringify(data, null, 1) + "\n";
let before = "";
try { before = await readFile("data.json", "utf8"); } catch {}
if (before === out) { console.log("data.json unchanged"); }
else { await writeFile("data.json", out); console.log(`data.json updated: ${data.total} contributions, ${merged} merged PRs, through ${last}`); }
