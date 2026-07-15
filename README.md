# stackcoach

A Socratic DSA and mock-interview coach that runs **entirely inside your browser**.
No backend, no API key, no data ever leaves your device — the model runs locally via
[WebLLM](https://github.com/mlc-ai/web-llm) on WebGPU.

Built for **OSDHack 2026** (theme: On-Device AI).

## Why this fits "on-device AI"

- The AI feature itself — generating hints, reviewing code, running mock interviews —
  is a local LLM (Llama 3.2 1B / Qwen 2.5 1.5B / Phi 3.5 mini, your choice) executed
  in-browser via WebGPU. Nothing is sent to a server for inference.
- Once the model weights are cached by the browser, the app works **fully offline**
  (turn off wifi and it still runs — try it).
- All session history ("call stack") lives in memory in the tab only; nothing is
  logged or synced anywhere.

## What it does

Three modes, one thread:

- **Socratic hints** — paste a DSA problem, get guided hints instead of the full
  answer straight away (so you actually learn the pattern).
- **Code review** — paste your solution, get complexity analysis, edge cases, and
  style feedback.
- **Mock interview** — the model plays interviewer: asks a question, evaluates your
  answer, follows up, the way a real technical interview goes.

Every practice turn gets pushed onto a visible **call stack** panel on the side —
a literal LIFO structure of your session, which felt like the right way to represent
DSA practice history rather than a generic chat log.

## Running it

No build step. You need a WebGPU-capable browser (recent Chrome/Edge).

```bash
# any static file server works, e.g.:
npx serve .
# or
python3 -m http.server 8000
```

Then open the printed local URL. Pick a model size from the dropdown and click
**load model** — the first load downloads and caches the weights (a few hundred MB
to ~2GB depending on model); after that it's instant and fully offline.

Recommended for weaker GPUs / laptops: start with **Llama 3.2 1B**.

## Stack

- Vanilla HTML/CSS/JS, no framework, no build tooling
- [`@mlc-ai/web-llm`](https://github.com/mlc-ai/web-llm) for in-browser LLM inference
  over WebGPU

## Status (mid-evaluation)

Working end-to-end: model loading with progress, all three modes, streaming
responses, and a call-stack session panel.

**New:** a **weak spots** panel — each practice turn is tagged with a topic
(arrays, DP, graphs, etc.) using a lightweight local keyword pass (no extra
model call), saved to `localStorage`, and aggregated into an all-time
weak-topics view. This is the part of the app that most needs to be on-device:
it's a private record of exactly what you keep struggling with, and it only
exists because nothing is ever sent off the device. A "clear local history"
control is included for full user control over that data.

Next: swap the keyword tagging for a locally-embedded classifier
(Transformers.js), and let the coach open a session by referencing your
actual weak spots ("you've hit graphs 4 times this week — want to start
there?").

## License

MIT — see [LICENSE](./LICENSE).
