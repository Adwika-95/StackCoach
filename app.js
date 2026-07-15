import { CreateMLCEngine } from "https://esm.run/@mlc-ai/web-llm";

/* ---------- elements ---------- */

const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const modelSelect = document.getElementById("modelSelect");
const loadBtn = document.getElementById("loadBtn");
const thread = document.getElementById("thread");
const composer = document.getElementById("composer");
const input = document.getElementById("input");
const pushBtn = document.getElementById("pushBtn");
const stackList = document.getElementById("stackList");
const stackCount = document.getElementById("stackCount");
const reqCount = document.getElementById("reqCount");
const modeButtons = document.querySelectorAll(".mode-btn");

/* ---------- state ---------- */

let engine = null;
let currentMode = "hint";
let frames = []; // { id, label, mode }
let history = []; // chat messages sent to the model (excluding system prompt, which is rebuilt per mode)
let frameCounter = 0;
let networkRequests = 0; // stays 0 for anything the coach itself does after the model is cached

/* ---------- local, on-device topic tracking ----------
   No model call, no network: a lightweight keyword pass tags each session
   with a topic, saved to localStorage so weak spots persist across reloads
   without ever leaving this device. */

const STORAGE_KEY = "stackcoach_history_v1";

const TOPIC_KEYWORDS = {
  arrays: ["array", "subarray", "two pointer", "sliding window"],
  strings: ["string", "substring", "palindrome", "anagram"],
  "linked list": ["linked list", "node", "pointer", "cycle"],
  trees: ["tree", "binary tree", "bst", "trie", "ancestor"],
  graphs: ["graph", "bfs", "dfs", "dijkstra", "topological", "island"],
  dp: ["dynamic programming", " dp ", "memo", "knapsack", "subsequence"],
  "heaps/stacks": ["heap", "priority queue", "stack", "queue", "monotonic"],
  recursion: ["recursion", "backtrack", "permutation", "combination"],
  "sorting/search": ["binary search", "sort", "merge sort", "quicksort"],
  behavioral: ["tell me about", "weakness", "conflict", "teamwork", "leadership"],
};

function detectTopic(text) {
  const lower = ` ${text.toLowerCase()} `;
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) return topic;
  }
  return "general";
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveHistoryEntry(entry) {
  const all = loadHistory();
  all.push(entry);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* storage full or unavailable — fail silently, session still works */
  }
}

function renderWeakSpots() {
  const all = loadHistory();
  const counts = {};
  all.forEach((e) => {
    counts[e.topic] = (counts[e.topic] || 0) + 1;
  });

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const listEl = document.getElementById("weakSpotsList");
  if (!listEl) return;

  if (entries.length === 0) {
    listEl.innerHTML = `<div class="weak-spots-empty">practice a bit — patterns you struggle with most will show up here</div>`;
    return;
  }

  const max = entries[0][1];
  listEl.innerHTML = entries
    .map(([topic, count]) => {
      const pct = Math.max(12, Math.round((count / max) * 100));
      return `
        <div class="weak-spot-item">
          <span class="weak-spot-label">${topic}</span>
          <span class="weak-spot-bar-track"><span class="weak-spot-bar-fill" style="width:${pct}%"></span></span>
          <span class="weak-spot-count">${count}</span>
        </div>`;
    })
    .join("");
}

const SYSTEM_PROMPTS = {
  hint: `You are a Socratic data-structures-and-algorithms coach. The student will paste a problem or describe what they're stuck on.
Never give the full solution immediately. Instead: ask a guiding question, point at the relevant pattern or data structure, or give one small hint at a time.
Only give complete code if the student explicitly asks for the full solution after hints. Keep responses concise.`,

  review: `You are a precise code reviewer for a CS student preparing for technical interviews.
Given code, analyze: correctness, time and space complexity, edge cases, and style. Point out the single most important issue first.
Do not rewrite the whole solution unless asked — suggest the fix as a short diff or description instead. Keep responses concise.`,

  interview: `You are conducting a mock technical interview for a software engineering internship.
Ask one interview question at a time (DSA, CS fundamentals, or behavioral), wait for the candidate's answer, then give a brief honest evaluation and a natural follow-up question, the way a real interviewer would.
If the student says "start", begin with a medium-difficulty DSA question. Keep each turn concise.`,
};

/* ---------- mode toggle ---------- */

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    modeButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentMode = btn.dataset.mode;
  });
});

/* ---------- model loading ---------- */

loadBtn.addEventListener("click", async () => {
  loadBtn.disabled = true;
  modelSelect.disabled = true;
  statusDot.className = "status-dot loading";

  const modelId = modelSelect.value;

  try {
    engine = await CreateMLCEngine(modelId, {
      initProgressCallback: (report) => {
        statusText.textContent = report.text || "loading model…";
      },
    });

    statusDot.className = "status-dot ready";
    statusText.textContent = `ready · ${modelId} · running on your device`;
    pushBtn.disabled = false;
  } catch (err) {
    statusDot.className = "status-dot";
    statusText.textContent = `failed to load: ${err.message || err}`;
    loadBtn.disabled = false;
    modelSelect.disabled = false;
  }
});

/* ---------- stack panel ---------- */

function pushFrame(label, modeOverride, topicOverride) {
  frameCounter += 1;
  const id = `frame-${frameCounter}`;
  const mode = modeOverride || currentMode;
  frames.push({ id, label });

  const el = document.createElement("div");
  el.className = "stack-frame";
  el.id = `stack-${id}`;
  el.innerHTML = `
    <div class="stack-frame-idx">#${frameCounter} · ${mode}${topicOverride ? " · " + topicOverride : ""}</div>
    <div class="stack-frame-label"></div>
  `;
  el.querySelector(".stack-frame-label").textContent = label;
  el.addEventListener("click", () => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  const empty = stackList.querySelector(".stack-empty");
  if (empty) empty.remove();

  stackList.appendChild(el);
  stackCount.textContent = `${frames.length} frame${frames.length === 1 ? "" : "s"}`;
  return id;
}

/* ---------- messaging ---------- */

function appendMessage(role, text, anchorId) {
  const wrap = document.createElement("div");
  wrap.className = `msg msg-${role}`;
  if (anchorId) wrap.id = anchorId;

  const roleEl = document.createElement("div");
  roleEl.className = "msg-role";
  roleEl.textContent = role === "user" ? "you" : "coach";

  const bodyEl = document.createElement("div");
  bodyEl.className = "msg-body";
  bodyEl.textContent = text;

  wrap.appendChild(roleEl);
  wrap.appendChild(bodyEl);
  thread.appendChild(wrap);
  thread.scrollTop = thread.scrollHeight;

  return bodyEl;
}

composer.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || !engine) return;

  const frameLabel = text.length > 48 ? text.slice(0, 48) + "…" : text;
  const topic = detectTopic(text);
  const anchorId = pushFrame(frameLabel, currentMode, topic);

  saveHistoryEntry({ label: frameLabel, mode: currentMode, topic, ts: Date.now() });
  renderWeakSpots();

  appendMessage("user", text, anchorId);
  input.value = "";
  pushBtn.disabled = true;

  const coachBody = appendMessage("coach", "…thinking (on-device)…");

  history.push({ role: "user", content: text });

  const messages = [{ role: "system", content: SYSTEM_PROMPTS[currentMode] }, ...history];

  try {
    const stream = await engine.chat.completions.create({
      messages,
      stream: true,
      temperature: 0.6,
    });

    let full = "";
    coachBody.textContent = "";
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content || "";
      full += delta;
      coachBody.textContent = full;
      thread.scrollTop = thread.scrollHeight;
    }

    history.push({ role: "assistant", content: full });
  } catch (err) {
    coachBody.textContent = `error: ${err.message || err}`;
  } finally {
    pushBtn.disabled = false;
  }
});

/* ---------- privacy counter ----------
   networkRequests intentionally never increments after model download —
   every chat turn above runs through the local WebGPU engine only. */
reqCount.textContent = `${networkRequests} network requests made by the coach after model load`;

/* ---------- init weak spots + clear control ---------- */

renderWeakSpots();

document.getElementById("clearHistory")?.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  renderWeakSpots();
});
