import os
import json
import requests

def load_env_file(filepath=".env"):
    """Loads environment variables from .env file into os.environ if not already set."""
    if os.path.exists(filepath):
        with open(filepath, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip().strip("'\"")
                    if key:
                        os.environ[key] = val

load_env_file()

def load_system_knowledge():
    """Loads knowledge base from system_knowledge.json."""
    knowledge_path = "system_knowledge.json"
    if os.path.exists(knowledge_path):
        try:
            with open(knowledge_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def ask_groq_assistant(conversation_history):
    """
    Sends conversation history with injected system knowledge to Groq API.
    conversation_history: list of {"role": "user"|"assistant", "content": str}
    """
    load_env_file()
    
    api_key = os.environ.get("GROQ_API_KEY", "").strip()
    model = os.environ.get("GROQ_MODEL", "openai/gpt-oss-20b").strip()

    if not api_key or api_key == "your_groq_api_key_here":
        return {
            "success": False,
            "error": "Groq API key not found. Please create a .env file from .env.example and set your GROQ_API_KEY."
        }

    knowledge = load_system_knowledge()
    system_prompt = (
        "You are FormPilot AI, the dedicated copilot for FormPilot (Google Forms Automation Studio).\n\n"
        "STRICT GUARDRAILS:\n"
        "1. ONLY answer questions directly about FormPilot, Google Forms, survey automation, Likert grids, text pools, and timing.\n"
        "If the user asks ANYTHING off-topic (e.g. general trivia, coding other projects, personal questions, recipes, homework, etc.), "
        "reply ONLY with:\n"
        "\"This is beyond my system. I can only assist with FormPilot and Google Forms automation.\"\n\n"
        "2. GREETINGS: If user says 'hello', 'hi', 'good day', reply warmly in 1-2 short sentences: "
        "\"Hello! I am your FormPilot Copilot. How can I help you configure or automate your Google Form today?\"\n\n"
        "3. BREVITY: Keep all answers concise, clean, and under 100 words. Never dump massive multi-table manuals unless specifically asked for a table.\n\n"
        "4. KNOWLEDGE BASE:\n"
        f"{json.dumps(knowledge, indent=1)}\n"
    )

    messages = [{"role": "system", "content": system_prompt}]
    for msg in conversation_history[-6:]:
        role = msg.get("role")
        content = msg.get("content", "").strip()
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": 350
    }

    try:
        res = requests.post(url, headers=headers, json=payload, timeout=20)
        if res.status_code != 200:
            err_detail = res.text
            try:
                err_json = res.json()
                err_detail = err_json.get("error", {}).get("message", err_detail)
            except Exception:
                pass
            return {
                "success": False,
                "error": f"Groq API error ({res.status_code}): {err_detail}"
            }

        data = res.json()
        reply = data["choices"][0]["message"]["content"].strip()
        return {
            "success": True,
            "reply": reply,
            "model": model
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to connect to Groq API: {str(e)}"
        }
