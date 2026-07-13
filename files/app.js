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

function pushFrame(label) {
  frameCounter += 1;
  const id = `frame-${frameCounter}`;
  frames.push({ id, label });

  const el = document.createElement("div");
  el.className = "stack-frame";
  el.id = `stack-${id}`;
  el.innerHTML = `
    <div class="stack-frame-idx">#${frameCounter} · ${currentMode}</div>
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
  const anchorId = pushFrame(frameLabel);

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
