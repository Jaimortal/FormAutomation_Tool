// FormPilot Frontend Engine

let currentSchema = null;
let currentConfig = { questions: {}, delay_rules: [] };
let generatedDataset = null;
let pollInterval = null;

let currentDelayRules = [
  { duration: 2, unit: "minutes", count: 3 },
  { duration: 1, unit: "minutes", count: 2 },
  { duration: 30, unit: "seconds", count: 2 }
];

document.addEventListener("DOMContentLoaded", () => {
  initEventListeners();
  initAiChat();
});

function initEventListeners() {
  // Stepper clicks
  document.getElementById("step-nav-1").addEventListener("click", () => switchStep(1));
  document.getElementById("step-nav-2").addEventListener("click", () => {
    if (currentSchema) switchStep(2);
  });
  document.getElementById("step-nav-3").addEventListener("click", () => {
    if (generatedDataset) switchStep(3);
  });
  document.getElementById("step-nav-4").addEventListener("click", () => switchStep(4));

  // Form scanning
  document.getElementById("btn-scan").addEventListener("click", handleScanUrl);
  document.getElementById("btn-parse-html").addEventListener("click", handleParseHtml);
  document.getElementById("btn-load-sample").addEventListener("click", handleLoadSample);
  document.getElementById("btn-proceed-to-config").addEventListener("click", () => switchStep(2));
  document.getElementById("btn-back-to-connect").addEventListener("click", () => switchStep(1));

  // Config actions
  document.getElementById("btn-quick-fill-positive").addEventListener("click", handleQuickFillPositive);
  document.getElementById("btn-generate-plan").addEventListener("click", handleGeneratePlanClick);
  document.getElementById("btn-back-to-adjust").addEventListener("click", () => switchStep(2));
  document.getElementById("btn-proceed-to-execute").addEventListener("click", () => switchStep(4));

  // Delay rules actions
  document.getElementById("btn-add-delay-rule").addEventListener("click", () => {
    currentDelayRules.push({ duration: 1, unit: "minutes", count: 1 });
    renderDelayRules();
  });
  document.getElementById("btn-preset-gaps-natural").addEventListener("click", () => {
    currentDelayRules = [
      { duration: 5, unit: "minutes", count: 2 },
      { duration: 2, unit: "minutes", count: 3 },
      { duration: 1, unit: "minutes", count: 2 },
      { duration: 30, unit: "seconds", count: 2 }
    ];
    renderDelayRules();
  });
  document.getElementById("btn-preset-gaps-quick").addEventListener("click", () => {
    currentDelayRules = [
      { duration: 10, unit: "seconds", count: 2 },
      { duration: 5, unit: "seconds", count: 3 },
      { duration: 2, unit: "seconds", count: 2 }
    ];
    renderDelayRules();
  });
  renderDelayRules();

  // Modal actions
  document.getElementById("btn-modal-cancel").addEventListener("click", () => {
    document.getElementById("modal-extrapolate-warning").classList.add("hidden");
  });
  document.getElementById("btn-modal-agree").addEventListener("click", () => {
    document.getElementById("modal-extrapolate-warning").classList.add("hidden");
    executeGeneratePlan();
  });

  // Preview actions
  document.getElementById("btn-reshuffle").addEventListener("click", () => executeGeneratePlan());
  document.getElementById("btn-export-plan-json").addEventListener("click", exportPlanJson);
  document.getElementById("btn-export-schema").addEventListener("click", exportSchemaJson);

  // Execution actions
  document.getElementById("btn-start-automation").addEventListener("click", startAutomation);
  document.getElementById("btn-pause-automation").addEventListener("click", pauseAutomation);
  document.getElementById("btn-stop-automation").addEventListener("click", stopAutomation);

  // Completion actions
  document.getElementById("btn-rerun-automation")?.addEventListener("click", () => {
    switchStep(4);
    startAutomation();
  });
  document.getElementById("btn-change-rating")?.addEventListener("click", () => {
    switchStep(2);
  });
  document.getElementById("btn-nav-home")?.addEventListener("click", () => {
    switchStep(1);
  });

  // Auto-refresh stats when switching back to this browser tab
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      pollStatus();
    }
  });

  // Check initial server state on load
  pollStatus();
}

// Switch Wizard Steps
function switchStep(stepNumber) {
  const sections = [
    document.getElementById("section-connect"),
    document.getElementById("section-config"),
    document.getElementById("section-preview"),
    document.getElementById("section-execute")
  ];

  sections.forEach((sec, idx) => {
    if (idx + 1 === stepNumber) {
      sec.classList.remove("hidden");
    } else {
      sec.classList.add("hidden");
    }
  });

  // Update Stepper Badges
  for (let i = 1; i <= 4; i++) {
    const navItem = document.getElementById(`step-nav-${i}`);
    const badgeNum = navItem.querySelector("span:first-child");
    const label = navItem.querySelector("span:last-child");

    if (i === stepNumber) {
      navItem.classList.remove("opacity-50");
      badgeNum.className = "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-brand-500 text-slate-950";
      label.className = "text-sm font-semibold text-slate-100";
    } else if (i < stepNumber) {
      navItem.classList.remove("opacity-50");
      badgeNum.className = "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-slate-800 text-brand-400";
      label.className = "text-sm font-semibold text-slate-300";
    } else {
      navItem.classList.add("opacity-50");
      badgeNum.className = "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-slate-800 text-slate-400";
      label.className = "text-sm font-semibold text-slate-400";
    }
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 1. Scan Form
async function handleScanUrl() {
  const url = document.getElementById("input-form-url").value.trim();
  if (!url) {
    alert("Please enter a Google Form URL.");
    return;
  }

  const errAlert = document.getElementById("scan-error-alert");
  const errMsg = document.getElementById("scan-error-message");
  if (errAlert) errAlert.classList.add("hidden");

  setScanningLoading(true);
  try {
    const res = await fetch("/api/scan-form", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (!data.success) {
      if (errAlert && errMsg) {
        errMsg.textContent = data.error || "Unknown error";
        errAlert.classList.remove("hidden");
      } else {
        alert("Error scanning form: " + (data.error || "Unknown error"));
      }
      return;
    }
    if (errAlert) errAlert.classList.add("hidden");
    applyParsedSchema(data.schema);
  } catch (err) {
    if (errAlert && errMsg) {
      errMsg.textContent = "Network error: " + err.message;
      errAlert.classList.remove("hidden");
    } else {
      alert("Network error: " + err.message);
    }
  } finally {
    setScanningLoading(false);
  }
}

async function handleParseHtml() {
  const html = document.getElementById("input-form-html").value.trim();
  if (!html) {
    alert("Please paste form HTML.");
    return;
  }
  setScanningLoading(true);
  try {
    const res = await fetch("/api/scan-form", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html })
    });
    const data = await res.json();
    if (!data.success) {
      alert("Error parsing HTML: " + (data.error || "Unknown error"));
      return;
    }
    applyParsedSchema(data.schema);
  } catch (err) {
    alert("Network error: " + err.message);
  } finally {
    setScanningLoading(false);
  }
}

async function handleLoadSample() {
  try {
    const res = await fetch("/api/load-sample");
    const data = await res.json();
    if (data.success) {
      document.getElementById("input-form-url").value = data.schema.submit_url.replace("/formResponse", "/viewform");
      applyParsedSchema(data.schema);
    }
  } catch (err) {
    alert("Error loading demo: " + err.message);
  }
}

function setScanningLoading(isLoading) {
  const spinner = document.getElementById("scan-spinner");
  const btnText = document.getElementById("scan-btn-text");
  const btn = document.getElementById("btn-scan");

  if (isLoading) {
    spinner.classList.remove("hidden");
    btnText.textContent = "Scanning Form Structure...";
    btn.disabled = true;
  } else {
    spinner.classList.add("hidden");
    btnText.textContent = "Scan & Parse Form";
    btn.disabled = false;
  }
}

function applyParsedSchema(schema) {
  currentSchema = schema;
  currentConfig = { questions: {} };

  // Update UI Cards
  document.getElementById("form-summary-card").classList.remove("hidden");
  document.getElementById("form-title").textContent = schema.title || "Untitled Form";
  document.getElementById("form-desc").textContent = schema.description || "No description provided.";
  document.getElementById("badge-question-count").textContent = schema.questions.length;
  document.getElementById("badge-section-count").textContent = schema.sections ? schema.sections.length : 1;

  let gridRowCount = 0;
  schema.questions.forEach(q => {
    if (q.type === "multiple_choice_grid") {
      gridRowCount += (q.rows || []).length;
    }
  });
  document.getElementById("badge-grid-count").textContent = gridRowCount;

  // Render question config forms
  renderQuestionsConfig(schema);
  renderDelayRules();
}

// Render Custom Delay Rules Table
function renderDelayRules() {
  const tbody = document.getElementById("delay-rules-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  currentDelayRules.forEach((rule, idx) => {
    const tr = document.createElement("tr");
    tr.className = "border-b border-slate-800/60 hover:bg-slate-900/40";
    tr.innerHTML = `
      <td class="p-2">
        <input type="number" min="1" max="3600" value="${rule.duration}" data-idx="${idx}" class="delay-duration-inp w-20 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-brand-300 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-brand-500">
      </td>
      <td class="p-2">
        <select data-idx="${idx}" class="delay-unit-select bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500">
          <option value="seconds" ${rule.unit === "seconds" ? "selected" : ""}>Seconds</option>
          <option value="minutes" ${rule.unit === "minutes" ? "selected" : ""}>Minutes</option>
        </select>
      </td>
      <td class="p-2">
        <div class="inline-flex items-center space-x-1.5">
          <input type="number" min="1" max="1000" value="${rule.count}" data-idx="${idx}" class="delay-count-inp w-16 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-teal-300 font-mono font-bold text-center focus:outline-none focus:ring-1 focus:ring-brand-500">
          <span class="text-xs text-slate-400">respondent(s)</span>
        </div>
      </td>
      <td class="p-2 text-right">
        <button data-idx="${idx}" class="btn-del-delay text-slate-400 hover:text-rose-400 text-sm font-bold px-2 py-0.5 transition-colors">&times;</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".delay-duration-inp").forEach(inp => {
    inp.addEventListener("change", (e) => {
      const idx = parseInt(e.target.dataset.idx);
      currentDelayRules[idx].duration = Math.max(1, parseInt(e.target.value || 1));
      updateDelaySummary();
    });
  });

  tbody.querySelectorAll(".delay-unit-select").forEach(sel => {
    sel.addEventListener("change", (e) => {
      const idx = parseInt(e.target.dataset.idx);
      currentDelayRules[idx].unit = sel.value;
      updateDelaySummary();
    });
  });

  tbody.querySelectorAll(".delay-count-inp").forEach(inp => {
    inp.addEventListener("change", (e) => {
      const idx = parseInt(e.target.dataset.idx);
      currentDelayRules[idx].count = Math.max(1, parseInt(e.target.value || 1));
      updateDelaySummary();
    });
  });

  tbody.querySelectorAll(".btn-del-delay").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const idx = parseInt(btn.dataset.idx);
      currentDelayRules.splice(idx, 1);
      renderDelayRules();
    });
  });

  updateDelaySummary();
}

function updateDelaySummary() {
  const targetRespondents = parseInt(document.getElementById("input-target-respondents")?.value || 50);
  const totalIntervals = Math.max(0, targetRespondents - 1);
  const sampleSum = currentDelayRules.reduce((a, b) => a + (parseInt(b.count) || 0), 0);

  let totalEstSeconds = 0;
  if (sampleSum > 0) {
    currentDelayRules.forEach(r => {
      const sec = r.unit === "minutes" ? r.duration * 60 : r.duration;
      const count = parseInt(r.count) || 0;
      totalEstSeconds += (sec * (count / sampleSum) * totalIntervals);
    });
  }

  const samplesBadge = document.getElementById("delay-summary-samples");
  const timeBadge = document.getElementById("delay-summary-time");

  if (samplesBadge) {
    samplesBadge.textContent = `Sample Gaps: ${sampleSum} (Scaled to ${totalIntervals} intervals)`;
  }
  if (timeBadge) {
    const min = Math.round(totalEstSeconds / 60);
    timeBadge.textContent = min < 1 ? `Est. Run Time: ~${Math.round(totalEstSeconds)}s` : `Est. Run Time: ~${min}m`;
  }
}

// 2. Render Questions Configuration Forms
function renderQuestionsConfig(schema) {
  const container = document.getElementById("questions-container");
  container.innerHTML = "";

  schema.questions.forEach((q, qIndex) => {
    const card = document.createElement("div");
    card.className = "rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl backdrop-blur-sm space-y-4";
    card.dataset.qid = q.id;

    // Header
    let typeBadge = "";
    if (q.type === "multiple_choice_grid") {
      typeBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">Likert / Multiple-Choice Grid (${q.rows.length} rows)</span>`;
    } else if (q.type === "text") {
      typeBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">Text Input (Shuffle Pool)</span>`;
    } else if (q.type === "linear_scale") {
      typeBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">Linear Scale (1-5)</span>`;
    } else {
      typeBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300">${q.type}</span>`;
    }

    card.innerHTML = `
      <div class="flex items-start justify-between">
        <div>
          <div class="flex items-center space-x-2">
            <span class="text-xs font-mono text-slate-500">#${qIndex + 1}</span>
            ${typeBadge}
            <span class="text-[11px] font-mono text-slate-400">${q.entry_id || ''}</span>
          </div>
          <h3 class="text-sm font-bold text-slate-100 mt-1">${q.title}</h3>
          ${q.description ? `<p class="text-xs text-slate-400 mt-0.5">${q.description}</p>` : ''}
        </div>
      </div>
      <div class="pt-2 border-t border-slate-800/80" id="q-body-${q.id}">
        <!-- specific body -->
      </div>
    `;

    container.appendChild(card);
    const bodyContainer = card.querySelector(`#q-body-${q.id}`);

    // Render body depending on type
    if (q.type === "text") {
      renderTextPoolWidget(q, bodyContainer);
    } else if (q.type === "multiple_choice_grid") {
      renderLikertGridWidget(q, bodyContainer);
    } else if (q.type === "linear_scale" || q.type === "choice") {
      renderScaleWidget(q, bodyContainer);
    }
  });
}

// 2a. Text Pool Tag Widget
function renderTextPoolWidget(q, container) {
  let initialPool = q.default_pool && q.default_pool.length > 0 
    ? [...q.default_pool] 
    : ["COT", "College of Technology", "College of Business", "COB"];

  currentConfig.questions[q.id] = {
    type: "text",
    pool: initialPool
  };

  container.innerHTML = `
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <label class="text-xs font-semibold text-slate-300">Variations Pool (Auto-shuffled across respondents):</label>
        <span class="text-[11px] text-slate-500">Press Enter or click Add to add more variations</span>
      </div>
      <div id="tags-container-${q.id}" class="flex flex-wrap gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800 min-h-[46px]">
        <!-- chips -->
      </div>
      <div class="flex items-center space-x-2">
        <input type="text" id="input-tag-${q.id}" placeholder="Type abbreviation or full name (e.g. 'College of Arts and Sciences')..." 
               class="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500 font-sans">
        <button id="btn-add-tag-${q.id}" class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors">
          + Add
        </button>
      </div>
    </div>
  `;

  const tagsBox = container.querySelector(`#tags-container-${q.id}`);
  const inputTag = container.querySelector(`#input-tag-${q.id}`);
  const btnAdd = container.querySelector(`#btn-add-tag-${q.id}`);

  function renderTags() {
    tagsBox.innerHTML = "";
    const pool = currentConfig.questions[q.id].pool;
    pool.forEach((item, idx) => {
      const chip = document.createElement("span");
      chip.className = "tag-chip inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-900 text-teal-300 border border-teal-500/30";
      chip.innerHTML = `
        <span>${item}</span>
        <button class="text-slate-400 hover:text-rose-400 text-xs font-bold transition-colors ml-1" data-idx="${idx}">&times;</button>
      `;
      chip.querySelector("button").addEventListener("click", () => {
        pool.splice(idx, 1);
        renderTags();
      });
      tagsBox.appendChild(chip);
    });
  }

  function addCurrentTag() {
    const val = inputTag.value.trim();
    if (val && !currentConfig.questions[q.id].pool.includes(val)) {
      currentConfig.questions[q.id].pool.push(val);
      inputTag.value = "";
      renderTags();
    }
  }

  btnAdd.addEventListener("click", addCurrentTag);
  inputTag.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addCurrentTag();
    }
  });

  renderTags();
}

// 2b. Likert / Multiple-Choice Grid Widget
function renderLikertGridWidget(q, container) {
  const columns = q.columns || ["1", "2", "3", "4", "5"];
  const rows = q.rows || [];

  if (!currentConfig.questions[q.id]) {
    currentConfig.questions[q.id] = {
      type: "multiple_choice_grid",
      rows: {}
    };
  }

  // Build grid HTML table
  let theadCols = columns.map(c => `<th class="p-2 text-center text-slate-300 font-semibold">${c}</th>`).join("");
  
  let tbodyRows = rows.map((r, rIdx) => {
    // Default initial counts: e.g. 2 for "5", 3 for "4", 1 for "3"
    currentConfig.questions[q.id].rows[r.entry_id] = {
      counts: {}
    };

    let colInputs = columns.map((c, cIdx) => {
      // Find numeric key if possible or column value
      const key = c;
      return `
        <td class="p-2 text-center">
          <div class="likert-counter-box inline-flex items-center justify-center bg-slate-950 border border-slate-800 rounded-lg p-1">
            <button class="w-5 h-5 rounded text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center text-xs font-bold btn-minus" data-qid="${q.id}" data-rid="${r.entry_id}" data-opt="${key}">-</button>
            <input type="number" min="0" value="0" data-qid="${q.id}" data-rid="${r.entry_id}" data-opt="${key}"
                   class="w-8 bg-transparent text-center font-bold text-brand-400 text-xs focus:outline-none input-likert-count font-mono">
            <button class="w-5 h-5 rounded text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center text-xs font-bold btn-plus" data-qid="${q.id}" data-rid="${r.entry_id}" data-opt="${key}">+</button>
          </div>
        </td>
      `;
    }).join("");

    return `
      <tr class="border-b border-slate-800/60 hover:bg-slate-900/40" data-rid="${r.entry_id}">
        <td class="p-2 text-slate-200 font-medium text-xs">
          <div>${r.row_title}</div>
          <div class="text-[10px] text-slate-500 font-mono">${r.entry_id}</div>
        </td>
        ${colInputs}
        <td class="p-2 text-right">
          <div class="flex items-center justify-end space-x-1.5">
            <span class="text-[11px] font-mono text-slate-400 row-sample-sum" data-rid="${r.entry_id}">Sample: 0</span>
            <button class="px-2 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium btn-row-preset" data-qid="${q.id}" data-rid="${r.entry_id}">
              Realistic
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  container.innerHTML = `
    <div class="space-y-2">
      <div class="flex items-center justify-between text-xs text-slate-400">
        <span>Enter sample response counts for each rating. If sample total is less than target respondents, pattern will be scaled.</span>
      </div>
      <div class="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60 custom-scrollbar">
        <table class="w-full text-left text-xs">
          <thead class="bg-slate-900/80 border-b border-slate-800">
            <tr>
              <th class="p-2 text-slate-400 font-semibold w-1/3">Evaluation Metric</th>
              ${theadCols}
              <th class="p-2 text-right text-slate-400 font-semibold">Row Total</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/40">
            ${tbodyRows}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Attach event handlers for plus/minus and direct inputs
  container.querySelectorAll(".input-likert-count").forEach(inp => {
    inp.addEventListener("change", () => updateLikertCount(inp));
  });

  container.querySelectorAll(".btn-plus").forEach(btn => {
    btn.addEventListener("click", () => {
      const qid = btn.dataset.qid;
      const rid = btn.dataset.rid;
      const opt = btn.dataset.opt;
      const inp = container.querySelector(`input[data-qid="${qid}"][data-rid="${rid}"][data-opt="${opt}"]`);
      inp.value = parseInt(inp.value || 0) + 1;
      updateLikertCount(inp);
    });
  });

  container.querySelectorAll(".btn-minus").forEach(btn => {
    btn.addEventListener("click", () => {
      const qid = btn.dataset.qid;
      const rid = btn.dataset.rid;
      const opt = btn.dataset.opt;
      const inp = container.querySelector(`input[data-qid="${qid}"][data-rid="${rid}"][data-opt="${opt}"]`);
      const val = parseInt(inp.value || 0);
      if (val > 0) {
        inp.value = val - 1;
        updateLikertCount(inp);
      }
    });
  });

  container.querySelectorAll(".btn-row-preset").forEach(btn => {
    btn.addEventListener("click", () => {
      applyRowPreset(q, btn.dataset.rid, container);
    });
  });
}

function updateLikertCount(inp) {
  const qid = inp.dataset.qid;
  const rid = inp.dataset.rid;
  const opt = inp.dataset.opt;
  const val = Math.max(0, parseInt(inp.value || 0));
  inp.value = val;

  if (!currentConfig.questions[qid].rows[rid]) {
    currentConfig.questions[qid].rows[rid] = { counts: {} };
  }
  currentConfig.questions[qid].rows[rid].counts[opt] = val;

  // Update sum badge
  const rowCounts = currentConfig.questions[qid].rows[rid].counts;
  const total = Object.values(rowCounts).reduce((a, b) => a + b, 0);
  const sumBadge = document.querySelector(`.row-sample-sum[data-rid="${rid}"]`);
  if (sumBadge) {
    sumBadge.textContent = `Sample: ${total}`;
    sumBadge.className = total > 0 
      ? "text-[11px] font-mono text-teal-300 font-bold row-sample-sum" 
      : "text-[11px] font-mono text-slate-400 row-sample-sum";
  }
}

function applyRowPreset(q, rid, container) {
  const columns = q.columns || ["1", "2", "3", "4", "5"];
  // Sample: 2 for 5, 3 for 4, 1 for 3
  columns.forEach(col => {
    const inp = container.querySelector(`input[data-qid="${q.id}"][data-rid="${rid}"][data-opt="${col}"]`);
    if (!inp) return;
    
    // Check if column is "5" or ends with "5" or Strongly Agree
    if (col.includes("5") || col.toLowerCase().includes("strongly agree")) {
      inp.value = 2;
    } else if (col.includes("4") || col.toLowerCase().includes("agree")) {
      inp.value = 3;
    } else if (col.includes("3") || col.toLowerCase().includes("neutral")) {
      inp.value = 1;
    } else {
      inp.value = 0;
    }
    updateLikertCount(inp);
  });
}

// 2c. Linear Scale Widget
function renderScaleWidget(q, container) {
  const options = q.options || ["1", "2", "3", "4", "5"];
  currentConfig.questions[q.id] = {
    type: q.type,
    counts: {}
  };

  let colsHtml = options.map(opt => `
    <div class="flex flex-col items-center space-y-1.5 p-2 bg-slate-950 border border-slate-800 rounded-xl">
      <span class="text-xs font-bold text-slate-300">${opt}</span>
      <div class="inline-flex items-center justify-center space-x-1">
        <button class="w-5 h-5 rounded text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center text-xs font-bold btn-scale-minus" data-qid="${q.id}" data-opt="${opt}">-</button>
        <input type="number" min="0" value="0" data-qid="${q.id}" data-opt="${opt}"
               class="w-10 bg-transparent text-center font-bold text-brand-400 text-xs focus:outline-none input-scale-count font-mono">
        <button class="w-5 h-5 rounded text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center text-xs font-bold btn-scale-plus" data-qid="${q.id}" data-opt="${opt}">+</button>
      </div>
    </div>
  `).join("");

  container.innerHTML = `
    <div class="space-y-3">
      <div class="flex items-center justify-between text-xs text-slate-400">
        <span>Set sample distribution count for each rating:</span>
        <span class="text-xs font-mono text-slate-400 scale-sample-sum" data-qid="${q.id}">Sample: 0</span>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
        ${colsHtml}
      </div>
    </div>
  `;

  container.querySelectorAll(".input-scale-count").forEach(inp => {
    inp.addEventListener("change", () => updateScaleCount(inp));
  });

  container.querySelectorAll(".btn-scale-plus").forEach(btn => {
    btn.addEventListener("click", () => {
      const qid = btn.dataset.qid;
      const opt = btn.dataset.opt;
      const inp = container.querySelector(`input[data-qid="${qid}"][data-opt="${opt}"]`);
      inp.value = parseInt(inp.value || 0) + 1;
      updateScaleCount(inp);
    });
  });

  container.querySelectorAll(".btn-scale-minus").forEach(btn => {
    btn.addEventListener("click", () => {
      const qid = btn.dataset.qid;
      const opt = btn.dataset.opt;
      const inp = container.querySelector(`input[data-qid="${qid}"][data-opt="${opt}"]`);
      const val = parseInt(inp.value || 0);
      if (val > 0) {
        inp.value = val - 1;
        updateScaleCount(inp);
      }
    });
  });
}

function updateScaleCount(inp) {
  const qid = inp.dataset.qid;
  const opt = inp.dataset.opt;
  const val = Math.max(0, parseInt(inp.value || 0));
  inp.value = val;

  currentConfig.questions[qid].counts[opt] = val;
  const counts = currentConfig.questions[qid].counts;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const sumBadge = document.querySelector(`.scale-sample-sum[data-qid="${qid}"]`);
  if (sumBadge) {
    sumBadge.textContent = `Sample: ${total}`;
    sumBadge.className = total > 0 
      ? "text-xs font-mono text-teal-300 font-bold scale-sample-sum" 
      : "text-xs font-mono text-slate-400 scale-sample-sum";
  }
}

// Quick Fill Positive Preset Across Entire Form
function handleQuickFillPositive() {
  if (!currentSchema) return;

  currentSchema.questions.forEach(q => {
    if (q.type === "multiple_choice_grid") {
      (q.rows || []).forEach(r => {
        applyRowPreset(q, r.entry_id, document);
      });
    } else if (q.type === "linear_scale" || q.type === "choice") {
      const options = q.options || ["1", "2", "3", "4", "5"];
      options.forEach(opt => {
        const inp = document.querySelector(`input[data-qid="${q.id}"][data-opt="${opt}"]`);
        if (!inp) return;
        if (opt === "5" || opt.includes("5")) inp.value = 2;
        else if (opt === "4" || opt.includes("4")) inp.value = 3;
        else if (opt === "3" || opt.includes("3")) inp.value = 1;
        else inp.value = 0;
        updateScaleCount(inp);
      });
    }
  });
}

// 3. Plan Generation & Warning Modal Logic
function handleGeneratePlanClick() {
  const targetRespondents = parseInt(document.getElementById("input-target-respondents").value || 50);
  
  // Inspect if any Likert grid rows or scales have total sample counts < targetRespondents
  let hasExtrapolation = false;
  const warningItems = [];

  currentSchema.questions.forEach(q => {
    const qCfg = currentConfig.questions[q.id] || {};
    if (q.type === "multiple_choice_grid") {
      (q.rows || []).forEach(r => {
        const rowCfg = (qCfg.rows || {})[r.entry_id] || {};
        const counts = rowCfg.counts || {};
        const sumVal = Object.values(counts).reduce((a, b) => a + b, 0);
        if (sumVal > 0 && sumVal < targetRespondents) {
          hasExtrapolation = true;
          warningItems.push(`• ${r.row_title}: ${sumVal} sample answers → Extrapolating to ${targetRespondents}`);
        }
      });
    } else if (q.type === "linear_scale" || q.type === "choice") {
      const counts = qCfg.counts || {};
      const sumVal = Object.values(counts).reduce((a, b) => a + b, 0);
      if (sumVal > 0 && sumVal < targetRespondents) {
        hasExtrapolation = true;
        warningItems.push(`• ${q.title}: ${sumVal} sample answers → Extrapolating to ${targetRespondents}`);
      }
    }
  });

  // Check delay rules extrapolation
  const delaySampleSum = currentDelayRules.reduce((a, b) => a + (parseInt(b.count) || 0), 0);
  const targetIntervals = Math.max(0, targetRespondents - 1);
  if (delaySampleSum > 0 && delaySampleSum < targetIntervals) {
    hasExtrapolation = true;
    warningItems.push(`• Delay Schedule: ${delaySampleSum} sample intervals → Scaled to ${targetIntervals} intervals between respondents`);
  }

  if (hasExtrapolation) {
    // Show user confirmation warning modal as specified!
    document.getElementById("modal-target-count").textContent = targetRespondents;
    const listContainer = document.getElementById("modal-warning-list");
    listContainer.innerHTML = warningItems.slice(0, 8).map(msg => `<div>${msg}</div>`).join("");
    if (warningItems.length > 8) {
      listContainer.innerHTML += `<div>... and ${warningItems.length - 8} more evaluation metrics</div>`;
    }
    document.getElementById("modal-extrapolate-warning").classList.remove("hidden");
  } else {
    executeGeneratePlan();
  }
}

async function executeGeneratePlan() {
  const targetRespondents = parseInt(document.getElementById("input-target-respondents").value || 50);

  // Prepare delay rules payload
  currentConfig.delay_rules = currentDelayRules.map(r => ({
    duration_seconds: r.unit === "minutes" ? r.duration * 60 : r.duration,
    count: parseInt(r.count) || 1,
    label: `${r.duration}${r.unit === "minutes" ? "m" : "s"}`
  }));

  try {
    const res = await fetch("/api/generate-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schema: currentSchema,
        user_config: currentConfig,
        target_respondents: targetRespondents
      })
    });

    const result = await res.json();
    if (!result.success) {
      alert("Error generating plan: " + result.error);
      return;
    }

    generatedDataset = result.data;
    renderDatasetPreview(generatedDataset);
    switchStep(3);
  } catch (err) {
    alert("Generation error: " + err.message);
  }
}

// 4. Render Shuffled Dataset Preview Table
function renderDatasetPreview(dataset) {
  const respondents = dataset.respondents || [];
  const estSeconds = dataset.delay_summary ? dataset.delay_summary.total_estimated_seconds : 0;
  const estMinutes = Math.round(estSeconds / 60);
  const timeNote = estMinutes > 0 ? `(~${estMinutes}m run time)` : `(~${Math.round(estSeconds)}s)`;
  document.getElementById("preview-total-badge").textContent = `${respondents.length} Respondents ${timeNote}`;

  const thead = document.getElementById("preview-thead");
  const tbody = document.getElementById("preview-tbody");

  if (respondents.length === 0) {
    thead.innerHTML = "";
    tbody.innerHTML = `<tr><td class="p-4 text-center text-slate-500">No respondents generated.</td></tr>`;
    return;
  }

  // Extract column keys from first respondent readable dict
  const colKeys = Object.keys(respondents[0].readable || {});

  thead.innerHTML = `
    <tr>
      <th class="p-3 text-brand-400 font-mono w-16">#</th>
      ${colKeys.map(k => `<th class="p-3 truncate max-w-xs" title="${k}">${k}</th>`).join("")}
    </tr>
  `;

  tbody.innerHTML = respondents.map((resp, idx) => {
    const cells = colKeys.map(k => {
      const val = resp.readable[k];
      return `<td class="p-3 truncate max-w-xs text-slate-200">${val}</td>`;
    }).join("");

    return `
      <tr class="hover:bg-slate-900/60 border-b border-slate-800/40">
        <td class="p-3 text-slate-500 font-mono font-bold">${resp.respondent_id}</td>
        ${cells}
      </tr>
    `;
  }).join("");
}

// 5. Execution Console Controls
async function startAutomation() {
  if (!generatedDataset || !generatedDataset.respondents) {
    alert("Please generate dataset plan first.");
    return;
  }

  const minDelay = parseFloat(document.getElementById("input-min-delay").value || 1.0);
  const maxDelay = parseFloat(document.getElementById("input-max-delay").value || 2.5);

  try {
    const res = await fetch("/api/start-submission", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        submit_url: currentSchema.submit_url,
        respondents: generatedDataset.respondents,
        min_delay: minDelay,
        max_delay: maxDelay,
        delay_schedule: generatedDataset.delay_schedule
      })
    });

    const result = await res.json();
    if (!result.success) {
      alert("Cannot start: " + result.error);
      return;
    }

    // Set buttons state
    document.getElementById("btn-start-automation").disabled = true;
    document.getElementById("btn-pause-automation").disabled = false;
    document.getElementById("btn-stop-automation").disabled = false;

    const completionCard = document.getElementById("completion-actions-card");
    if (completionCard) completionCard.classList.add("hidden");

    // Start polling status
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(pollStatus, 800);
  } catch (err) {
    alert("Error starting automation: " + err.message);
  }
}

async function pauseAutomation() {
  await fetch("/api/pause-submission", { method: "POST" });
}

async function stopAutomation() {
  await fetch("/api/stop-submission", { method: "POST" });
}

async function pollStatus() {
  try {
    const res = await fetch("/api/status");
    const data = await res.json();

    // Update Progress bar & counters
    document.getElementById("counter-current").textContent = data.current_index;
    document.getElementById("counter-total").textContent = data.total;
    document.getElementById("counter-percent").textContent = `${data.progress_percent}%`;
    document.getElementById("progress-bar-fill").style.width = `${data.progress_percent}%`;

    document.getElementById("counter-success").textContent = data.success_count;
    document.getElementById("counter-failed").textContent = data.failed_count;
    document.getElementById("counter-remaining").textContent = Math.max(0, data.total - data.current_index);

    // Update live countdown banner
    const countdownBanner = document.getElementById("live-countdown-banner");
    const countdownDisplay = document.getElementById("countdown-timer-display");
    const countdownText = document.getElementById("countdown-status-text");

    if (countdownBanner && countdownDisplay) {
      if (data.is_waiting && data.countdown_seconds > 0) {
        countdownBanner.classList.remove("hidden");
        countdownBanner.classList.add("flex");
        const totalSec = Math.ceil(data.countdown_seconds);
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        countdownDisplay.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        countdownText.textContent = `Gap delay: Waiting before submitting Respondent #${data.current_index + 1}... (${totalSec}s remaining)`;
      } else {
        countdownBanner.classList.add("hidden");
        countdownBanner.classList.remove("flex");
      }
    }

    // Update pill
    const statusPill = document.getElementById("engine-status-pill");
    const completionCard = document.getElementById("completion-actions-card");
    statusPill.textContent = data.status.toUpperCase();
    if (data.status === "running") {
      statusPill.className = "px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse";
      document.getElementById("btn-start-automation").disabled = true;
      document.getElementById("btn-pause-automation").disabled = false;
      document.getElementById("btn-stop-automation").disabled = false;
      if (completionCard) completionCard.classList.add("hidden");
      if (!pollInterval) pollInterval = setInterval(pollStatus, 800);
    } else if (data.status === "paused") {
      statusPill.className = "px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30";
      document.getElementById("btn-start-automation").disabled = true;
      document.getElementById("btn-pause-automation").disabled = false;
      document.getElementById("btn-stop-automation").disabled = false;
      if (completionCard) completionCard.classList.add("hidden");
    } else if (data.status === "completed") {
      // Ensure visual counters snap to 100% on completion
      document.getElementById("counter-current").textContent = data.total;
      document.getElementById("counter-percent").textContent = "100%";
      document.getElementById("progress-bar-fill").style.width = "100%";
      document.getElementById("counter-remaining").textContent = "0";

      statusPill.textContent = "COMPLETED";
      statusPill.className = "px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
      document.getElementById("btn-start-automation").disabled = false;
      document.getElementById("btn-pause-automation").disabled = true;
      document.getElementById("btn-stop-automation").disabled = true;

      if (countdownBanner) {
        countdownBanner.classList.add("hidden");
        countdownBanner.classList.remove("flex");
      }

      if (completionCard) {
        completionCard.classList.remove("hidden");
      }

      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    } else if (data.status === "stopped") {
      statusPill.className = "px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30";
      document.getElementById("btn-start-automation").disabled = false;
      document.getElementById("btn-pause-automation").disabled = true;
      document.getElementById("btn-stop-automation").disabled = true;
      
      if (countdownBanner) {
        countdownBanner.classList.add("hidden");
        countdownBanner.classList.remove("flex");
      }

      if (completionCard) {
        completionCard.classList.add("hidden");
      }

      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    }

    // Update Logs
    const logBox = document.getElementById("log-terminal");
    if (data.logs && data.logs.length > 0) {
      logBox.innerHTML = data.logs.map(l => {
        let colorClass = "text-slate-300";
        if (l.level === "success") colorClass = "text-emerald-400";
        if (l.level === "warning") colorClass = "text-amber-400";
        if (l.level === "error") colorClass = "text-rose-400";

        return `<div class="flex items-start space-x-2">
          <span class="text-slate-600">[${l.timestamp}]</span>
          <span class="${colorClass}">${l.message}</span>
        </div>`;
      }).join("");
      logBox.scrollTop = logBox.scrollHeight;
    }
  } catch (err) {
    console.error("Poll status error:", err);
  }
}

// Download Helper
function exportPlanJson() {
  if (!generatedDataset) return;
  const str = JSON.stringify(generatedDataset, null, 2);
  downloadBlob(str, "generated_respondents_dataset.json", "application/json");
}

function exportSchemaJson() {
  if (!currentSchema) return;
  const str = JSON.stringify(currentSchema, null, 2);
  downloadBlob(str, "form_schema.json", "application/json");
}

function downloadBlob(content, filename, contentType) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 6. Groq AI Assistant Controller
let aiChatHistory = [];

function initAiChat() {
  const toggleBtn = document.getElementById("btn-toggle-ai-chat");
  const closeBtn = document.getElementById("btn-close-ai-chat");
  const chatWindow = document.getElementById("ai-chat-window");
  const sendBtn = document.getElementById("btn-send-ai-chat");
  const chatInput = document.getElementById("ai-chat-input");
  const chips = document.querySelectorAll(".ai-chip");

  if (!toggleBtn || !chatWindow) return;

  toggleBtn.addEventListener("click", () => {
    chatWindow.classList.toggle("hidden");
    if (!chatWindow.classList.contains("hidden")) {
      chatInput.focus();
    }
  });

  closeBtn.addEventListener("click", () => {
    chatWindow.classList.add("hidden");
  });

  chips.forEach(chip => {
    chip.addEventListener("click", () => {
      const prompt = chip.dataset.prompt;
      if (prompt) {
        chatInput.value = prompt;
        handleSendAiMessage();
      }
    });
  });

  sendBtn.addEventListener("click", handleSendAiMessage);
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendAiMessage();
    }
  });
}

async function handleSendAiMessage() {
  const input = document.getElementById("ai-chat-input");
  const text = input.value.trim();
  if (!text) return;

  input.value = "";
  appendAiMessage("user", text);
  aiChatHistory.push({ role: "user", content: text });

  const typing = document.getElementById("ai-typing-indicator");
  if (typing) typing.classList.remove("hidden");
  scrollAiChatToBottom();

  try {
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: aiChatHistory })
    });

    const data = await res.json();
    if (typing) typing.classList.add("hidden");

    if (data.success && data.reply) {
      appendAiMessage("assistant", data.reply);
      aiChatHistory.push({ role: "assistant", content: data.reply });
    } else {
      appendAiMessage("assistant", `⚠️ **AI Notice:** ${data.error || "Unable to reach Groq API."}`);
    }
  } catch (err) {
    if (typing) typing.classList.add("hidden");
    appendAiMessage("assistant", `⚠️ **Network Error:** ${err.message}`);
  }

  scrollAiChatToBottom();
}

function appendAiMessage(role, text) {
  const container = document.getElementById("ai-chat-messages");
  if (!container) return;

  const msgDiv = document.createElement("div");
  if (role === "user") {
    msgDiv.className = "flex items-start justify-end space-x-2";
    msgDiv.innerHTML = `
      <div class="rounded-xl bg-indigo-600/90 text-white p-2.5 max-w-[85%] text-xs leading-relaxed break-words shadow-sm">
        ${escapeHtml(text)}
      </div>
      <div class="w-6 h-6 rounded-lg bg-indigo-500/30 text-indigo-300 flex items-center justify-center text-xs shrink-0 mt-0.5 font-bold">
        U
      </div>
    `;
  } else {
    msgDiv.className = "flex items-start space-x-2";
    msgDiv.innerHTML = `
      <div class="w-6 h-6 rounded-lg bg-brand-500/30 text-brand-300 flex items-center justify-center text-xs shrink-0 mt-0.5 font-bold">
        AI
      </div>
      <div class="rounded-xl bg-slate-800/90 text-slate-200 p-2.5 max-w-[85%] text-xs leading-relaxed break-words border border-slate-700/60 shadow-sm">
        ${formatAiMarkdown(text)}
      </div>
    `;
  }

  container.appendChild(msgDiv);
}

function escapeHtml(str) {
  const p = document.createElement("p");
  p.textContent = str;
  return p.innerHTML;
}

function formatAiMarkdown(text) {
  if (!text) return "";
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks
  html = html.replace(/```([\s\S]*?)```/g, '<pre class="bg-slate-950 p-2 rounded text-[11px] font-mono overflow-x-auto my-1 border border-slate-800">$1</pre>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-slate-950 text-brand-300 px-1 py-0.5 rounded font-mono text-[10px]">$1</code>');
  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Lists
  html = html.replace(/^\s*[-*]\s+(.*)$/gm, '<li class="ml-3 list-disc">$1</li>');
  // Newlines
  html = html.replace(/\n/g, '<br>');
  return html;
}

function scrollAiChatToBottom() {
  const container = document.getElementById("ai-chat-messages");
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

