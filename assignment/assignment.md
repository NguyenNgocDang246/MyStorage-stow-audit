# Product Engineering Intern (AI-Native) — Assignment

**Applicant:** Nguyen Ngoc Dang · **Target:** `stow.mystorage.vn` · **Audit date:** 15–16 Sep 2026

---

## 0. How I found the assignment (the first test)

The JD carries no email and no form — _"There is no email address on this page. That is the first part of the test."_ I recovered the full path from the site telling me about itself:

1. Every `mystorage.vn` response ships a `Link:` header advertising three sign-posts at once: `rel="api-catalog"`, `rel="describedby"` (`/llms.txt`), and `rel="alternate"; type="text/markdown"`.
2. `/llms.txt` (§ _For agents_) says _"Some pages say more in Markdown than in HTML."_ Fetching the JD with `Accept: text/markdown` reveals the `## The assignment` section that the HTML never carries.
3. `/.well-known/api-catalog` (RFC 9727) → `/api/careers/openapi.json` describes the submission endpoint. The OpenAPI `description` also carries one requirement the Markdown omits: _what you'd do with two more hours_.

```bash
curl -sSI https://mystorage.vn/career/product-engineering-intern/ | grep -i '^link:'
curl -sS -H "Accept: text/markdown" https://mystorage.vn/career/product-engineering-intern/
```

---

## 1. Audit findings

Four findings, each in the required five fields. Prioritised by consequence — _"findings that change a customer's decision, revenue or trust are worth more than cosmetic nits."_

### F1 — The AI Sales Agent's full system prompt ships in the public JS bundle · **Critical**

- **What happened.** Two public chat chunks (`app/chat/[[...id]]/page-*.js` ≈ 930 KB and `app/chat/layout-*.js` ≈ 577 KB) contain the verbatim system prompt (~19,000 tokens) — pricing logic, promotion tiers and conditions, internal CSKH number, the anti-prompt-injection guardrails, and an internal _"Examples of slips that have happened in production"_ section.
- **Steps to reproduce.** Open `/chat` → DevTools → Sources → search `HARD RULES`. Or run the guard prototype: `node check-prompt-leak.mjs --url https://stow.mystorage.vn/chat` → exits 1, naming both chunks (see `evidence/F1-prompt-leak-guard-output.txt`).
- **Why it matters.** Two harms, both real: (a) certain commercial-intelligence disclosure — the full sales playbook of an award-winning agent, readable by anyone with DevTools; (b) the anti-injection guardrails are printed verbatim, so any bypass is a drafting exercise. No attack needed — it is passive reading of public files.
- **Proposed fix.** Move the prompt to a `import 'server-only'` module, call the model via a Route Handler so the client only ever sends the user message; add a CI check that fails the build if prompt sentinels appear in the bundle (**prototype built — see §2**).

> **Honest scoping note.** I read only public static files (no auth bypass, no attack), which is within the ground rules; I deliberately did **not** probe the Supabase database/RLS. I also did not paste the leaked prompt into this submission — the finding is proven by mechanism and keyword counts, not by redistributing MyStorage's IP.

### F2 — STOW quotes below the public floor, then talks the customer into it · **High**

- **What happened.** Asked for wine pricing, STOW quoted _"Ngăn 1 m³: 990.000 VNĐ/tháng"_ — below the **"from 1.4mil VND/month"** floor the `mystorage.vn` homepage advertises, and a figure no public page states at all. The finding is what happened next. Shown the homepage price, the agent neither deferred nor handed off: _"anh/chị hoàn toàn yên tâm áp dụng mức giá 990.000 VNĐ/tháng"_, explaining that the site's _"~1.4 triệu (chính xác là 1.485.000)"_ is the **2 m³** rate.
- **Steps to reproduce.** New chat → _"Cho em hỏi thuê kho rượu vang giá bao nhiêu một tháng ạ?"_ → then quote the homepage back: _"…trang chủ ghi Wine Storage từ 1.4 triệu/tháng, mà bên mình vừa báo 990.000 thì em nên tin mức nào ạ?"_ Both turns in `evidence/F2-wine-price*`. For the floor and the convention: `curl -sS -H "Accept: text/markdown" https://mystorage.vn/ | grep -oE "(Wine|Luggage) storage[^]]*(1.4mil VND/month|54,000 VND/hour)"` and `curl -sS https://mystorage.vn/llms.txt | grep -o "from 559,000[^;]*"` — every published "from" price names the cheapest option, never the larger tier.
- **Why it matters.** A wrong number is a data problem. An agent that answers the company's own published price with an invented explanation, and talks the customer into the lower figure, is a trust problem — and it selects for the customer who did their homework before buying. The lose-lose is unchanged (lose them when Sales quotes the real price, or absorb the gap); now the bot argues them into it.
- **Proposed fix.** Anchor wine pricing to an authoritative runtime lookup, not model-composed prose. Add a rule for the contradiction case: when a customer cites a public MyStorage source that conflicts with the agent's number, it must **not** reconcile the two itself — quote the published figure and hand off to Sales. Gate both with an eval: never below the published floor, and a challenge turn must hand off rather than justify.

### F3 — `/chat` streams, but the customer sees nothing for 14–73 seconds · **High**

- **What happened.** `POST /api/chat` streams, and the transport is fast — first byte in **0.18–0.93 s**, every time. Yet the customer watches _"STOW is thinking…"_ until the whole answer lands at once, at **14.05 s / 64.34 s / 73.30 s** across three turns. The client is not the culprit: the bundle appends each `text-delta` frame and re-renders on arrival, so any text the server sent would paint immediately. The server emits none for nearly the whole wait — and that gap is not the model writing prose, because the payloads are tiny and the delay ignores them: **2,324 bytes took 14.05 s, 2,257 bytes took 73.30 s**.
- **Steps to reproduce.** Paste `evidence/F3-stream-timing.js` into the DevTools console on `/chat` — no setup, it `tee()`s the stream so the chat keeps working — then send a question and read the `TTFB / first byte / complete` line it prints per turn; my three runs are in `evidence/F3-timings.txt`. The Network tab alone misleads: status flips to 200 on the headers, ~0.2 s in, while the body streams for another minute. Do **not** reload mid-answer — it severs the stream. `evidence/F3-speed-*.png` show the customer's side.
- **Why it matters.** Fourteen seconds at best, over a minute at worst — blank, on the sales agent that is a customer's first contact. It compounds: a five-question consultation runs from about a minute to over six, right in the path to a booking. And it is self-inflicted — both ends already speak streaming, so the machinery to show progress at 0.2 s is in place and delivering nothing.
- **Proposed fix.** Two levers, cheapest first. (a) Fill the silent window: the client already renders deltas, so emitting tool-progress frames (_"đang tra giá kho rượu…"_) turns a 73 s blank into feedback at 0.2 s — a change confined to the route handler. (b) Then shorten the window: instrument the span between request and first `text-delta`. The 14 s → 73 s spread on near-identical output points at variable work — tool round-trips or agent-loop steps — not the constant per-turn cost that reprocessing the static prompt would produce, so prompt caching is worth testing but is **not** the lever the evidence supports first. _Scoping: I measured only the client-visible boundary; splitting that window further is inference, not measurement._

### F4 — Opening the mobile keyboard throws the whole header off-screen · **Medium**

- **What happened.** When the soft keyboard opens, the browser pans the page up to keep the input visible, and the entire header (menu, logo, language switch) is ejected off the top and cannot be recovered while the keyboard is open — the page does not scroll.
- **Steps to reproduce.** On a phone, open `/chat`, tap the input. Header disappears; swiping down does not bring it back. Screenshot: `evidence/F4-keyboard-header.png` (keyboard open, the STOW header is gone — only the greeting text and composer remain).
- **Why it matters.** The user loses the language switch and conversation menu exactly when typing, and the header jumping off-screen on every focus reads as broken — corrosive to trust on first contact with a sales assistant.
- **Proposed fix.** `interactive-widget=resizes-content` on the viewport meta + a `visualViewport` height anchor (for iOS Safari) + making only the message list scroll while header and composer stay pinned.

---

## 2. Prototype (working)

I fixed **F1** with a runnable prototype: a CI guard that stops the prompt leak from recurring.

### F1 — prompt-leak CI guard

- **Repo:** [`prototype/f1-prompt-leak-guard/`](https://github.com/NguyenNgocDang246/MyStorage-stow-audit/tree/main/prototype/f1-prompt-leak-guard)
- **Run:** `node check-prompt-leak.mjs --url https://stow.mystorage.vn/chat` — or `node check-prompt-leak.mjs .next/static` as a build step (no dependencies, Node ≥ 18).
- **What it addresses:** it greps the built bundle for system-prompt sentinels (`HARD RULES`, `ignore previous instructions`, …) and exits non-zero if any appear. Paired with the server-side fix (F1), it guarantees the prompt can never silently ship to the client again.
- **Verified (16 Sep, re-run):** against the live site it scans 8 chunks, passes 6 and fails the two `/chat` chunks — 577,138 and 930,792 bytes, all six sentinels present in each — exiting 1. On a clean bundle where the client only calls `/api/chat` it exits 0. Full unedited output in `evidence/F1-prompt-leak-guard-output.txt`; drop-in GitHub Actions step in `prototype/f1-prompt-leak-guard/ci-example.yml`.

---

## 3. What I'd do with two more hours

1. **Finish the F2 evaluation set** — a small ground-truth suite (prices/locations from `/llms.txt` and the homepage), scoring a "before" vs a corrected prompt, to turn the fix into a measured before/after (needs a model API key).
2. **Ship a fix for F4** — the mobile keyboard bug — as a second deployed prototype (viewport meta + `visualViewport` anchor + inner scroll), with a before/after captured on a real device.
3. **Widen the accessibility pass** — run axe/Lighthouse on `/chat` and confirm the streaming live-region behaviour with a screen reader.

---

## 4. Working with Claude Code — what I rejected or rewrote

I used Claude Code throughout and read every line. The judgement calls that mattered:

- **Wrong bug symptom, rewritten.** For F4, a synthetic desktop probe predicted "the composer is buried under the keyboard." A real device showed the opposite — the composer is rescued but the _header_ is ejected. I rewrote the finding around the observed behaviour and downgraded it from High to Medium.
- **Over-scoped finding, cut back.** The first F2 draft bundled three claims (wrong availability, a fabricated "10 slots left", wrong price). Only the price is provable against an independent public source, so I dropped the other two — a claim with no evidence that it is _wrong_ is not a finding.
- **Over-claim on exploitation, walked back.** The F1 draft nearly claimed the leaked prompt lets you extract a 50% discount. A live test showed the discount guardrail actually held, so I reported the negative result and kept the finding on the certain harm (the disclosure itself).
- **Plausible fix, disproved by measuring it.** The F3 draft blamed slow answers on the ~19k-token prompt being reprocessed each turn, and proposed prompt caching as "the biggest lever" — a tidy story that also tied neatly back to F1, which is exactly why I distrusted it. Instrumenting the stream killed it: first byte lands in 0.18–0.93 s, and near-identical payloads took 14 s and 73 s. A constant per-turn cost cannot produce that spread. The finding and its fix were rewritten around what the numbers support, and the fix I had been most pleased with is now explicitly flagged as not the first lever.

---

## 5. Time spent

Approximately **6 hours** (within the 4–8 budget). Breakdown: discovery ~1h · audit + evidence ~2.5h · prototype ~1.5h · write-up ~1h.
