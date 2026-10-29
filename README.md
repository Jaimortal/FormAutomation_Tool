# FormPilot — Intelligent Local Google Forms Automation Studio

FormPilot is a standalone, local web application engineered to parse, configure, mathematically scale, and automate responses for Google Forms. It natively handles complex form architectures including **multi-page sections (`pageHistory`)**, **text variation pools (e.g., shuffling College Departments)**, **Likert scale Multiple-Choice Grids**, and **custom variable human-like delay intervals**.

Runs **100% locally on your machine** — no external servers, database installations, or cloud deployments required.

---

> [!CAUTION]
> ### CRITICAL ADVISORY & BEHAVIORAL GUARANTEES
> 
> 1. **All Generated Responses Are Strictly Based on User Input:**  
>    FormPilot **never invents, guesses, or hallucinates answers**. It will only pick options, ratings, and text variations that you explicitly configure.
> 
> 2. **Algorithmic Gap-Filling (Mathematical Scaling):**  
>    If your sample answers total less than the target respondent count (e.g., you enter `2` for rating 5, `3` for rating 4, and `1` for rating 3 = total `6` answers, but request `50` respondents):
>    - The system **only** uses ratings `5`, `4`, and `3`. Unselected ratings (such as `1` and `2`) will **never** be chosen (their probability remains strictly `0%`).
>    - The internal algorithm uses the **Largest Remainder Method (Hare-Niemeyer Algorithm)** to proportionally extrapolate your exact ratios (e.g., 33.3% for 5, 50% for 4, 16.7% for 3) so the resulting dataset matches your target count down to the exact integer.
> 
> 3. **Non-Continuous Response Shuffling:**  
>    Once the scaled response distribution is calculated, the entire dataset is **globally shuffled** across all respondents. This guarantees that responses do not appear in predictable, consecutive blocks, simulating organic individual submissions while maintaining exact statistical integrity.
> 
> 4. **Timing & Gap Interval Scaling:**  
>    Custom delay intervals (e.g., 5 min, 2 min, 30 sec) follow the same scaling and shuffling logic: the algorithm scales your sample timing preferences across all intervals between respondents and adds small humanized jitter ($\pm 4\%$) so no two delay gaps are robotically identical.

---

## 🛠️ Languages, Frameworks & Libraries Used

| Component | Technology | Version / Spec | Purpose |
| :--- | :--- | :--- | :--- |
| **Backend Runtime** | **Python** | 3.10+ | Core server, data processing, and automation engine |
| **Web Server** | **Flask** | $\ge 3.0.0$ | Local lightweight REST API and web routing framework (`threaded=True`) |
| **HTTP Client** | **Requests** | $\ge 2.31.0$ | Form scraping and direct `/formResponse` HTTP submissions with connection isolation |
| **Frontend Scripting**| **JavaScript (ES6+)** | Modern Vanilla JS | Interactive UI controller, real-time polling, state synchronization, and DOM manipulation |
| **UI Styling** | **Tailwind CSS** | CDN (Tailwind 3) | Modern dark-mode layout, responsive cards, modals, and design system |
| **Typography & Icons** | **Google Fonts & SVG** | Inter, JetBrains Mono | High-legibility typography and visual indicators |
| **Windows Launcher** | **Batch Script (.bat)**| Windows CMD | One-click local application startup without terminal commands |

---

## 📂 Project Architecture & File Breakdown

```text
testing 1/
├── app.py                     # Flask web server & REST API controller
├── form_parser.py             # Google Form parser, schema extractor & URL normalizer
├── generator.py               # Pattern scaling algorithm, shuffling & delay scheduler
├── submitter.py               # Threaded background submitter with safety timeouts & countdown
├── start.bat                  # 1-click Windows launcher
├── requirements.txt           # Python package dependencies
├── templates/
│   └── index.html             # Single-Page Application (SPA) HTML interface
└── static/
    ├── app.js                 # Frontend engine, event handlers & live poll controller
    └── style.css              # Custom styling, animations, and scrollbars
```

### Module Responsibilities:

#### 1. [`app.py`](file:///c:/School%20Related%20File/Portfolio%20project/Self%20project%20automation%20tool/testing%201/app.py)
- Serves the Single-Page Application at `http://127.0.0.1:5000`.
- Provides REST API endpoints:
  - `POST /api/scan-form`: Fetches and parses Google Form schema.
  - `GET /api/load-sample`: Loads a built-in demo questionnaire for instant testing.
  - `POST /api/generate-plan`: Executes the gap-filling math, text shuffling, and delay scheduling.
  - `POST /api/start-submission`: Triggers background multi-threaded submission.
  - `POST /api/pause-submission` & `POST /api/resume-submission`: Real-time execution control.
  - `POST /api/stop-submission`: Safely aborts ongoing submissions.
  - `GET /api/status`: Provides live metrics, progress percentage, countdown timers, and terminal logs.

#### 2. [`form_parser.py`](file:///c:/School%20Related%20File/Portfolio%20project/Self%20project%20automation%20tool/testing%201/form_parser.py)
- **URL Normalization:** Supports `forms.gle` shortlinks, `/viewform`, `/edit`, `/prefill`, and query parameters (`?usp=sharing`, etc.).
- **Schema Extraction:** Extracts Google’s embedded `FB_PUBLIC_LOAD_DATA_` JavaScript variable containing question titles, descriptions, types, and choices.
- **Section & Grid Detection:** Detects page breaks (`type 8`) and maps `pageHistory` (e.g., `0,1,2,3`). Identifies **Multiple-Choice Grids / Likert Scales (`type 7`)** and extracts every unique row `entry.XXXXXXXX` ID and column scale.

#### 3. [`generator.py`](file:///c:/School%20Related%20File/Portfolio%20project/Self%20project%20automation%20tool/testing%201/generator.py)
- **`calculate_scaled_distribution()`**: Implements the Largest Remainder Method (Hare-Niemeyer Algorithm) to scale sample counts up or down while guaranteeing that integer sums match the exact target respondent count.
- **`generate_respondents_dataset()`**: Generates the full respondent matrix, shuffles text variations from user pools, applies rating distributions, and randomizes row positions.
- **`generate_delay_schedule()`**: Takes custom delay rules (e.g., 5m, 2m, 30s) and generates an interspersed, shuffled interval list with $\pm 4\%$ organic human jitter.

#### 4. [`submitter.py`](file:///c:/School%20Related%20File/Portfolio%20project/Self%20project%20automation%20tool/testing%201/submitter.py)
- **Threaded Execution:** Runs submissions asynchronously in the background so the web UI remains completely responsive.
- **Isolated HTTP Connections:** Submits with `Connection: close` and dual connect/read timeouts `(8.0s, 15.0s)` to prevent socket hanging.
- **Sub-Second Sleep Interruptibility:** Long sleep intervals (e.g. 5 minutes) sleep in 0.3-second increments, enabling instant **Pause** or **Stop** without waiting for the timer to elapse.
- **Live Countdown State:** Exposes remaining seconds for the active time gap to the frontend.

#### 5. [`templates/index.html`](file:///c:/School%20Related%20File/Portfolio%20project/Self%20project%20automation%20tool/testing%201/templates/index.html) & [`static/app.js`](file:///c:/School%20Related%20File/Portfolio%20project/Self%20project%20automation%20tool/testing%201/static/app.js)
- **Step 1: Connect Form:** Public access advisory, URL input box, error diagnostics, and 1-click Demo Survey loader.
- **Step 2: Configure & Scale:** Target respondent counter, College Department tag chips manager, Likert grid matrix with increment/decrement counters, and custom delay intervals table.
- **Step 3: Preview & Verify:** Full tabular respondent preview, "Re-Shuffle Order" button, and JSON dataset exporter.
- **Step 4: Live Execution:** Real-time progress bar, live countdown widget, activity stream, and the **Completion Actions Card** (Re-Run Automation, Change Rating/Responses, Home).

---

## ⚡ How to Install and Run

### Prerequisites
- Python 3.10 or higher installed.

### Installation
1. Open PowerShell or Command Prompt in this folder:
   ```powershell
   python -m pip install -r requirements.txt
   ```

### Starting the Application
- Simply double-click [`start.bat`](file:///c:/School%20Related%20File/Portfolio%20project/Self%20project%20automation%20tool/testing%201/start.bat), or run:
  ```powershell
  python app.py
  ```
- Open your browser to:
  ```text
  http://127.0.0.1:5000
  ```

---

## 📋 Google Form Settings Checklist

For automated HTTP submissions to succeed:
1. **Public Sharing:** Set form access to *"Anyone with the link can respond"*.
2. **Form Settings Tab:**
   - ❌ **Turn OFF** *"Limit to 1 response"* (this forces Google Account login).
   - ❌ **Turn OFF** *"Restrict to users in [Organization]"*.
   - ❌ Ensure there are no CAPTCHA plugins or sign-in walls enabled.
