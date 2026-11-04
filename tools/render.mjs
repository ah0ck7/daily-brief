#!/usr/bin/env node
// Renders a brief JSON (same shape the Brief app uses) into one static, self-contained HTML page.
// Usage: node tools/render.mjs brief.json out.html
// Then:  node tools/publish.mjs recap ./out.html     (or morning)
import { readFile, writeFile } from "node:fs/promises";

const [,, src, dest] = process.argv;
if (!src || !dest) { console.error("Usage: node render.mjs brief.json out.html"); process.exit(1); }
const b = JSON.parse(await readFile(src, "utf8"));

const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const arr = (x) => (Array.isArray(x) ? x : []);
const p = (cls, t) => (t ? `<p class="${cls}">${esc(t)}</p>` : "");
const section = (title, count, inner) =>
  `<section class="sec" aria-label="${esc(title)}"><div class="sec-h"><h2 class="eyebrow">${esc(title)}</h2>${count ? `<p class="n">${esc(count)}</p>` : ""}</div><div class="rows">${inner}</div></section>`;
const item = (n) =>
  `<div class="row"><div class="item">${n.action ? `<span class="act">${esc(n.action)}</span>` : ""}<span class="ttl">${esc(n.title)}</span>${n.sub ? `<span class="sub">${esc(n.sub)}</span>` : ""}</div></div>`;
const meeting = (m) => {
  const det = arr(m.detail).filter(Boolean);
  const time = `<span style="display:flex;flex-direction:column;gap:2px"><span class="tm">${esc(m.time)}</span>${m.dur ? `<span class="du">${esc(m.dur)}</span>` : ""}</span>`;
  const head = `<span style="display:flex;flex-direction:column;gap:3px;min-width:0"><span class="ttl">${esc(m.title)}</span><span class="sub">${m.tag ? `<span class="tag">${esc(m.tag)} </span>` : ""}${esc(m.sub)}</span></span>`;
  const body = det.length
    ? `<details class="row"><summary class="mtg">${time}${head}<span class="chev">&#9662;</span></summary><div class="in">${det.map((t) => `<p>${esc(t)}</p>`).join("")}</div></details>`
    : `<div class="row"><div class="mtg">${time}${head}<span></span></div></div>`;
  return body + (m.flag ? `<p class="flag">${esc(m.flag)}</p>` : "");
};

const today = [];
today.push(`<section class="sum" aria-label="Summary"><p class="d">${esc(b.dayLabel)}</p>${b.summary ? `<p class="s">${esc(b.summary)}</p>` : ""}</section>`);
if (arr(b.today).length || b.todayNote)
  today.push(section("Today", "", arr(b.today).map(meeting).join("") + (b.todayNote ? p("note", b.todayNote) : "")));
const needs = arr(b.needs);
if (!b.hideNeeds)
  today.push(section(b.needsTitle || "Needs you", needs.length ? `${needs.length} ${needs.length === 1 ? "item" : "items"}` : "",
    needs.map(item).join("") || p("clear", "You're clear. Nothing needs you right now.")));
const inv = arr(b.invites);
if (!b.hideInvites)
  today.push(section("Invites", inv.length ? `${inv.length} waiting` : "", inv.map(item).join("") || p("clear", b.invitesNote || "Every invite is answered.")));
if (b.due) today.push(section("Due today", "", `<p class="txt">${esc(b.due)}</p>`));
for (const x of arr(b.extra))
  today.push(section(x.title, "", (x.text ? `<p class="txt">${esc(x.text)}</p>` : "") + arr(x.items).map(item).join("")));

const w = b.week || {};
const hasWeek = arr(w.days).length > 0;
let week = "";
if (hasWeek) {
  week += section(w.label || "Week ahead", "", arr(w.days).map((d) =>
    `<div class="row"><div class="day"><p class="dn">${esc(d.day)}</p><div class="li">${arr(d.items).map((it) => {
      const o = typeof it === "string" ? { text: it } : it;
      return `<p>${o.tag ? `<span class="tag">${esc(o.tag)} </span>` : ""}${esc(o.text)}</p>`;
    }).join("")}</div></div></div>`).join(""));
  if (arr(w.fixes).length) week += section("Worth fixing", "", arr(w.fixes).map((t) => `<div class="row"><p class="fix">${esc(t)}</p></div>`).join(""));
  if (arr(w.waiting).length) week += section("Waiting on others", "", arr(w.waiting).map((t) => `<div class="row"><p class="fix">${esc(t)}</p></div>`).join(""));
}

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><title>Alex Daily Brief</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Text&family=Lato:wght@300;400;700&family=Oswald:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--bg:#1D252C;--fg:#F2F0EC;--fg-2:rgba(242,240,236,.82);--fg-3:rgba(242,240,236,.68);--fg-4:rgba(242,240,236,.56);--rule:#48565A;--rule-soft:rgba(72,86,90,.55);--accent:#B9D2DC;--warn:#E3B98A;--display:'DM Serif Text',Georgia,serif;--body:Lato,'Helvetica Neue',Arial,sans-serif;--num:Oswald,'Arial Narrow',sans-serif;color-scheme:dark}
@media(prefers-color-scheme:light){:root{--bg:#F4F6F7;--fg:#1D252C;--fg-2:rgba(29,37,44,.86);--fg-3:rgba(29,37,44,.72);--fg-4:rgba(29,37,44,.62);--rule:#9AA8AC;--rule-soft:rgba(72,86,90,.28);--accent:#2F6073;--warn:#8A5A1F;color-scheme:light}}
*{box-sizing:border-box}body{background:var(--bg);color:var(--fg);font-family:var(--body);margin:0;font-size:16px;line-height:1.5;padding:0 max(16px,env(safe-area-inset-right)) 56px max(16px,env(safe-area-inset-left))}
p{margin:0}.wrap{max-width:480px;margin:0 auto}
.eyebrow{font-size:11px;line-height:16px;letter-spacing:.18em;text-transform:uppercase;color:var(--fg-4);font-weight:400;margin:0}
.top{display:flex;justify-content:space-between;align-items:center;padding-top:calc(22px + env(safe-area-inset-top))}.top .t{font-size:12px;color:var(--fg-4)}
.vtitle{margin:14px 0 0;font-family:var(--display);font-weight:400;font-size:28px;line-height:1.1}.vtitle span{display:block}.vtitle span:nth-child(2){color:var(--fg-4)}.vtitle span:nth-child(3){color:var(--fg-4);opacity:.75}
.sec{position:relative;margin-top:36px;padding-left:22px}.sec::before{content:"";position:absolute;left:0;top:8px;bottom:0;width:1px;background:var(--rule)}.sec::after{content:"";position:absolute;left:0;top:8px;width:14px;height:1px;background:var(--rule)}
.sec-h{display:flex;align-items:baseline;justify-content:space-between}.sec-h .n{font-size:12px;color:var(--fg-4)}
.rows{margin-top:10px;display:flex;flex-direction:column}.row{border-top:1px solid var(--rule-soft)}.row:last-child{border-bottom:1px solid var(--rule-soft)}
.mtg{display:grid;grid-template-columns:56px minmax(0,1fr) 20px;gap:10px;align-items:start;min-height:64px;padding:14px 0;list-style:none;cursor:pointer}summary::-webkit-details-marker{display:none}
.tm{font-family:var(--num);font-size:20px;line-height:24px}.du{font-size:12px;color:var(--fg-4)}
.ttl{font-size:16px;line-height:22px;font-weight:700;overflow-wrap:anywhere}.sub{font-size:13px;line-height:18px;color:var(--fg-3);overflow-wrap:anywhere}.tag{color:var(--accent)}
.chev{color:var(--fg-4);text-align:right}details[open] .chev{transform:rotate(180deg)}
.in{display:flex;flex-direction:column;gap:6px;padding:0 0 16px 66px;font-size:14px;color:var(--fg-2)}.flag{padding:0 0 12px 66px;font-size:12px;color:var(--warn)}
.item{display:flex;flex-direction:column;gap:3px;padding:14px 0;min-height:56px;justify-content:center}
.act{font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--accent)}
.clear{padding-top:14px;font-size:14px;color:var(--accent)}.note{padding-top:12px;font-size:12px;color:var(--fg-4)}.txt{padding-top:12px;font-size:15px;color:var(--fg-2)}
.tabs{position:sticky;top:0;z-index:2;background:var(--bg);margin-top:28px;padding-top:8px;display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid var(--rule-soft)}
.tabs button{font:inherit;background:none;border:0;border-bottom:2px solid transparent;margin-bottom:-1px;min-height:44px;font-size:14px;color:var(--fg-4);cursor:pointer}.tabs button[aria-selected=true]{color:var(--fg);border-bottom-color:var(--fg)}
.sum{margin-top:32px}.sum .d{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--fg-4)}.sum .s{margin-top:10px;color:var(--fg-2)}
.day{display:grid;grid-template-columns:56px minmax(0,1fr);gap:10px;padding:14px 0}.dn{font-family:var(--num);font-size:15px;letter-spacing:.08em;text-transform:uppercase}.li{display:flex;flex-direction:column;gap:6px;font-size:14px;color:var(--fg-2)}
.fix{padding:14px 0;font-size:14px;color:var(--fg-2)}.upd{margin-top:40px;font-size:11px;color:var(--fg-4);text-align:center}
[hidden]{display:none!important}
</style></head><body><div class="wrap">
<div class="top"><p class="eyebrow">${esc(b.kindLabel || "Daily brief")}</p><p class="t">${esc(b.time)}</p></div>
<h1 class="vtitle"><span>Abiding in Jesus,</span><span>we are making disciples</span><span>together.</span></h1>
${hasWeek ? `<div class="tabs" role="tablist"><button type="button" role="tab" id="t1" aria-selected="true">Today</button><button type="button" role="tab" id="t2" aria-selected="false">Week ahead</button></div>` : ""}
<div id="p1">${today.join("")}</div>
${hasWeek ? `<div id="p2" hidden>${week}</div>` : ""}
${b.updatedAt ? `<p class="upd">Updated ${esc(b.updatedAt)}</p>` : ""}
</div>
${hasWeek ? `<script>var a=document.getElementById("t1"),c=document.getElementById("t2"),x=document.getElementById("p1"),y=document.getElementById("p2");function s(w){x.hidden=w;y.hidden=!w;a.setAttribute("aria-selected",!w);c.setAttribute("aria-selected",w)}a.onclick=function(){s(false)};c.onclick=function(){s(true)}</script>` : ""}
</body></html>`;
await writeFile(dest, html);
console.log(`Rendered ${src} -> ${dest} (${html.length} bytes)`);
