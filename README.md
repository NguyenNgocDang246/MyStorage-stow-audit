# stow.mystorage.vn — product audit + prototype

Audit of the STOW AI sales agent at [stow.mystorage.vn](https://stow.mystorage.vn), submitted for
the **Product Engineering Intern (AI-Native)** role at MyStorage.
Nguyen Ngoc Dang · 15–16 Sep 2026.

The full write-up — findings, prototype, what I'd do with two more hours, what I rejected from
Claude Code, hours spent — is in **[`assignment/assignment.md`](assignment/assignment.md)**.

## Findings

| # | Finding | Severity |
|---|---------|----------|
| **F1** | The AI sales agent's full system prompt (~19k tokens) ships in the public JS bundle | **Critical** |
| **F2** | STOW quotes wine storage below the public floor — then, challenged with the homepage, invents a reason the customer should use the lower price | **High** |
| **F3** | `/chat` streams from 0.2 s, yet the customer sees nothing for 14–73 s | **High** |
| **F4** | Opening the mobile keyboard throws the whole header off-screen | **Medium** |

Scope note: only public static files were read — no auth bypass, no attack, no probing of the
database. The leaked prompt is **not** reproduced anywhere in this repo; F1 is proven by
mechanism and keyword counts, not by redistributing MyStorage's IP.

## Prototype — F1 prompt-leak CI guard

A build-step guard that fails the build if system-prompt sentinels appear in client bundles, so
the leak in F1 cannot silently come back. No dependencies, Node ≥ 18.

```bash
cd prototype/f1-prompt-leak-guard

node check-prompt-leak.mjs fixtures/leaky-bundle.js   # leaking build  -> FAIL, exit 1
node check-prompt-leak.mjs fixtures/clean-bundle.js   # clean build    -> PASS, exit 0
node check-prompt-leak.mjs .next/static               # how it runs in CI, after `next build`
```

Run against the live site to reproduce the finding:

```bash
node check-prompt-leak.mjs --url https://stow.mystorage.vn/chat   # -> FAIL, names both chunks
```

Details and how to plug it into GitHub Actions:
[`prototype/f1-prompt-leak-guard/README.md`](prototype/f1-prompt-leak-guard/README.md) ·
[`ci-example.yml`](prototype/f1-prompt-leak-guard/ci-example.yml).

## Evidence

| File | Backs |
|------|-------|
| [`evidence/F1-prompt-leak-guard-output.txt`](evidence/F1-prompt-leak-guard-output.txt) | Guard run against the live site — two leaking chunks, exit 1 |
| [`evidence/F2-wine-price-transcript.md`](evidence/F2-wine-price-transcript.md) · [`.png`](evidence/F2-wine-price.png) · [`-challenge.png`](evidence/F2-wine-price-challenge.png) | Both turns: the under-floor quote, and the agent defending it against the homepage |
| [`evidence/F3-stream-timing.js`](evidence/F3-stream-timing.js) | Paste-into-console measurement hook — reproduce the timings yourself in one step |
| [`evidence/F3-timings.txt`](evidence/F3-timings.txt) | My three runs — 14.05 / 64.34 / 73.30 s, first byte under 1 s — and how to read them |
| [`evidence/F3-speed-thinking.png`](evidence/F3-speed-thinking.png) · [`F3-speed-answer.png`](evidence/F3-speed-answer.png) | The wait state a customer sits through between question and answer |
| [`evidence/F4-keyboard-header.png`](evidence/F4-keyboard-header.png) | Mobile, keyboard open — the STOW header is gone |

The prototype README and the evidence notes are written in Vietnamese; the assignment write-up is
in English.

## Layout

```
assignment/assignment.md   the write-up (findings, prototype, 2 more hours, AI notes, hours)
links/links.md             things I've built
prototype/                 the working prototype for F1
evidence/                  screenshots + guard output referenced by the write-up
```
