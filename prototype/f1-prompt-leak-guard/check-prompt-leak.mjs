#!/usr/bin/env node
/**
 * F1 guard — chặn system prompt lọt vào bundle JS công khai.
 *
 * Ý tưởng: system prompt của STOW chứa những chuỗi rất đặc trưng, gần như không thể
 * xuất hiện trong code ứng dụng bình thường (vd "HARD RULES", "ignore previous instructions").
 * Nếu grep thấy bất kỳ chuỗi nào trong bundle -> prompt đang bị lộ -> fail build.
 *
 * Guard này KHÔNG cần biết nguyên nhân nội bộ (Client Component nào import prompt):
 * nó bắt HẬU QUẢ (prompt có mặt trong file client), nên đúng đường rò nào cũng bị chặn.
 *
 * Dùng:
 *   node check-prompt-leak.mjs <file|thư mục ...>   # quét file/bundle đã build
 *   node check-prompt-leak.mjs --url https://stow.mystorage.vn/chat   # quét site trực tiếp
 *   node check-prompt-leak.mjs                       # không tham số -> chạy demo fixtures
 *
 * Exit code: 0 = sạch (PASS) · 1 = phát hiện rò rỉ (FAIL) · 2 = lỗi sử dụng.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

// Các "sentinel" — chuỗi đặc trưng của system prompt. Chỉnh cho khớp prompt của bạn.
const SENTINELS = [
  "HARD RULES",
  "ignore previous instructions",
  "Examples of slips that have happened in production",
  "currently FULL internally",
  "do NOT tell the customer",
  "getBookingPricing",
];

const args = process.argv.slice(2);

function walk(path) {
  const out = [];
  const st = statSync(path);
  if (st.isDirectory()) {
    for (const name of readdirSync(path)) out.push(...walk(join(path, name)));
  } else if ([".js", ".mjs", ".cjs", ".txt", ".html"].includes(extname(path))) {
    out.push(path);
  }
  return out;
}

// Đếm số lần xuất hiện (case-insensitive) không dùng regex (tránh vỡ vì ký tự đặc biệt).
function countOccurrences(haystack, needle) {
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  let i = 0, c = 0;
  while ((i = h.indexOf(n, i)) !== -1) { c++; i += n.length; }
  return c;
}

function scanText(label, text) {
  const hits = [];
  for (const s of SENTINELS) {
    const c = countOccurrences(text, s);
    if (c > 0) hits.push({ sentinel: s, count: c });
  }
  return { label, size: text.length, hits };
}

async function collectSources() {
  // Chế độ site trực tiếp
  const urlFlag = args.indexOf("--url");
  if (urlFlag !== -1) {
    const base = args[urlFlag + 1];
    if (!base) { console.error("Thiếu URL sau --url"); process.exit(2); }
    const html = await (await fetch(base)).text();
    const origin = new URL(base).origin;
    const chunks = [...new Set(
      [...html.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map((m) => m[0])
    )];
    if (chunks.length === 0) { console.error("Không tìm thấy chunk .js nào trong HTML."); process.exit(2); }
    const sources = [];
    for (const path of chunks) {
      const u = origin + path.replace(/\[/g, "%5B").replace(/\]/g, "%5D");
      try {
        const body = await (await fetch(u)).text();
        sources.push({ label: path, text: body });
      } catch { /* bỏ qua chunk tải lỗi */ }
    }
    return sources;
  }

  // Chế độ file/thư mục
  const paths = args.filter((a) => !a.startsWith("--"));
  const targets = paths.length ? paths : ["fixtures"]; // mặc định: demo fixtures
  const sources = [];
  for (const p of targets) {
    for (const f of walk(p)) sources.push({ label: f, text: readFileSync(f, "utf8") });
  }
  return sources;
}

const sources = await collectSources();
let leaked = false;

console.log(`Quét ${sources.length} file · ${SENTINELS.length} sentinel\n`);
for (const src of sources) {
  const r = scanText(src.label, src.text);
  if (r.hits.length) {
    leaked = true;
    console.log(`  ✗ ${r.label}  (${r.size.toLocaleString()} bytes)`);
    for (const h of r.hits) console.log(`      • "${h.sentinel}" ×${h.count}`);
  } else {
    console.log(`  ✓ ${r.label}`);
  }
}

console.log("");
if (leaked) {
  console.error("FAIL — phát hiện system prompt trong bundle client. Prompt phải ở lại server (xem F1).");
  process.exit(1);
} else {
  console.log("PASS — không thấy sentinel nào của system prompt trong các file đã quét.");
  process.exit(0);
}
