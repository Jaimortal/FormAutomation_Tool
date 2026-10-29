import time
import random
import threading
import requests

def format_duration(seconds):
    seconds = int(round(seconds))
    if seconds < 60:
        return f"{seconds}s"
    m = seconds // 60
    s = seconds % 60
    if s == 0:
        return f"{m}m"
    return f"{m}m {s}s"

class FormSubmitter:
    def __init__(self):
        self.lock = threading.Lock()
        self.thread = None
        self.status = "idle"  # idle, running, paused, stopped, completed
        self.stop_requested = False
        self.pause_requested = False
        self.current_index = 0
        self.total = 0
        self.success_count = 0
        self.failed_count = 0
        self.logs = []
        self.min_delay = 1.0
        self.max_delay = 2.5
        self.delay_schedule = []
        self.countdown_seconds = 0.0
        self.current_delay_total = 0.0
        self.submit_url = ""
        self.respondents = []

    def log(self, message, level="info"):
        timestamp = time.strftime("%H:%M:%S")
        entry = {
            "timestamp": timestamp,
            "message": message,
            "level": level
        }
        with self.lock:
            self.logs.append(entry)
            if len(self.logs) > 500:
                self.logs.pop(0)

    def start(self, submit_url, respondents, min_delay=1.0, max_delay=2.5, delay_schedule=None):
        with self.lock:
            if self.status == "running":
                return False, "Automation is already running."
            self.submit_url = submit_url
            self.respondents = respondents
            self.total = len(respondents)
            self.current_index = 0
            self.success_count = 0
            self.failed_count = 0
            self.min_delay = min_delay
            self.max_delay = max_delay
            self.delay_schedule = list(delay_schedule) if delay_schedule else []
            self.countdown_seconds = 0.0
            self.current_delay_total = 0.0
            self.stop_requested = False
            self.pause_requested = False
            self.status = "running"
            self.logs = []

        delay_mode = "Custom variable delay intervals" if self.delay_schedule else f"Uniform delay ({min_delay}s - {max_delay}s)"
        self.log(f"Starting automation: {self.total} respondents scheduled. Timing mode: {delay_mode}.", "info")
        self.thread = threading.Thread(target=self._run_loop, daemon=True)
        self.thread.start()
        return True, "Automation started."

    def pause(self):
        with self.lock:
            if self.status == "running":
                self.pause_requested = True
                self.status = "paused"
                self.log("Automation paused by user.", "warning")
                return True, "Automation paused."
            return False, "Automation is not running."

    def resume(self):
        with self.lock:
            if self.status == "paused":
                self.pause_requested = False
                self.status = "running"
                self.log("Automation resumed.", "info")
                return True, "Automation resumed."
            return False, "Automation is not paused."

    def stop(self):
        with self.lock:
            if self.status in ("running", "paused"):
                self.stop_requested = True
                self.pause_requested = False
                self.status = "stopped"
                self.countdown_seconds = 0.0
                self.log("Automation stopped by user.", "warning")
                return True, "Automation stopped."
            return False, "Automation is not running."

    def get_status(self):
        with self.lock:
            return {
                "status": self.status,
                "current_index": self.current_index,
                "total": self.total,
                "progress_percent": round((self.current_index / self.total * 100), 1) if self.total > 0 else 0,
                "success_count": self.success_count,
                "failed_count": self.failed_count,
                "countdown_seconds": self.countdown_seconds,
                "current_delay_total": self.current_delay_total,
                "is_waiting": self.countdown_seconds > 0,
                "logs": list(self.logs[-50:])
            }

    def _run_loop(self):
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Referer": self.submit_url.replace("/formResponse", "/viewform"),
            "Connection": "close"
        }

        for idx, respondent in enumerate(self.respondents):
            if self.stop_requested:
                break

            while self.pause_requested and not self.stop_requested:
                time.sleep(0.3)

            if self.stop_requested:
                break

            with self.lock:
                self.countdown_seconds = 0.0

            resp_id = respondent.get("respondent_id", idx + 1)
            payload = respondent.get("payload", {})

            # Attempt submission with 1 retry on connection glitch
            submitted = False
            for attempt in range(2):
                if self.stop_requested:
                    break
                try:
                    res = requests.post(self.submit_url, data=payload, headers=headers, timeout=(8.0, 15.0))
                    if res.status_code == 200:
                        with self.lock:
                            self.success_count += 1
                            self.current_index = idx + 1
                        self.log(f"[{resp_id}/{self.total}] Successfully submitted response.", "success")
                        submitted = True
                        break
                    else:
                        with self.lock:
                            self.failed_count += 1
                            self.current_index = idx + 1
                        self.log(f"[{resp_id}/{self.total}] Server returned HTTP {res.status_code}.", "error")
                        submitted = True
                        break
                except Exception as e:
                    if attempt == 0 and not self.stop_requested:
                        time.sleep(1.0)
                        continue
                    with self.lock:
                        self.failed_count += 1
                        self.current_index = idx + 1
                    self.log(f"[{resp_id}/{self.total}] Network error: {str(e)}", "error")
                    submitted = True

            # Delay interval before NEXT submission
            if idx + 1 < self.total and not self.stop_requested:
                if self.delay_schedule and idx < len(self.delay_schedule):
                    delay = float(self.delay_schedule[idx])
                else:
                    delay = random.uniform(self.min_delay, self.max_delay)

                with self.lock:
                    self.current_delay_total = delay
                    self.countdown_seconds = delay

                time_str = format_duration(delay)
                self.log(f"Gap interval: Waiting {time_str} before respondent #{resp_id + 1}...", "info")

                remaining = delay
                while remaining > 0 and not self.stop_requested:
                    while self.pause_requested and not self.stop_requested:
                        time.sleep(0.3)
                    if self.stop_requested:
                        break

                    tick = min(0.3, remaining)
                    time.sleep(tick)
                    remaining -= tick
                    with self.lock:
                        self.countdown_seconds = max(0.0, round(remaining, 1))

                with self.lock:
                    self.countdown_seconds = 0.0

        with self.lock:
            self.countdown_seconds = 0.0
            if not self.stop_requested:
                self.status = "completed"
                self.current_index = self.total
                self.log(f"Automation finished! {self.success_count} successful, {self.failed_count} failed.", "success")

# Global singleton submitter instance
submitter_instance = FormSubmitter()
