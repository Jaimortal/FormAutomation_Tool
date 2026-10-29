// FormPilot UI helpers: theme toggle, keyboard shortcuts and small UX niceties.
// Loaded after app.js; does not change any app logic.
(function () {
  const root = document.documentElement;

  // ---------- Dark / light theme ----------
  const toggle = document.getElementById("btn-theme-toggle");
  function applyTheme(dark, persist) {
    root.classList.toggle("dark", dark);
    if (toggle) toggle.setAttribute("aria-checked", String(dark));
    if (persist) {
      try { localStorage.setItem("formpilot-theme", dark ? "dark" : "light"); } catch (e) {}
    }
  }
  applyTheme(root.classList.contains("dark"), false);
  if (toggle) toggle.addEventListener("click", () => applyTheme(!root.classList.contains("dark"), true));

  // Follow OS theme changes only if the user never picked one manually
  try {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
      if (!localStorage.getItem("formpilot-theme")) applyTheme(e.matches, false);
    });
  } catch (e) {}

  // ---------- Press Enter in the URL box to scan ----------
  const urlInput = document.getElementById("input-form-url");
  const scanBtn = document.getElementById("btn-scan");
  if (urlInput && scanBtn) {
    urlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); scanBtn.click(); }
    });
  }

  // ---------- +/- stepper buttons for number inputs ----------
  document.querySelectorAll(".stepper-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.stepTarget);
      if (!input) return;
      const min = Number(input.min || 1), max = Number(input.max || 100000);
      const next = Math.min(max, Math.max(min, (Number(input.value) || 0) + Number(btn.dataset.step)));
      input.value = next;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });

  // ---------- Keyboard shortcuts ----------
  const chatWindow = document.getElementById("ai-chat-window");
  const modal = document.getElementById("modal-extrapolate-warning");
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (e.key === "Escape") {
      if (modal && !modal.classList.contains("hidden")) {
        document.getElementById("btn-modal-cancel")?.click();
      } else if (chatWindow && !chatWindow.classList.contains("hidden")) {
        document.getElementById("btn-close-ai-chat")?.click();
      }
    }
    if (typing) return;
    if (e.shiftKey && e.key.toLowerCase() === "d") toggle?.click();
    if (e.shiftKey && e.key === "?") document.getElementById("btn-toggle-ai-chat")?.click();
  });
})();

