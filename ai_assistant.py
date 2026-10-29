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

# Automatically load .env on module import
load_env_file()

def load_system_knowledge():
    """Loads knowledge base from system_knowledge.json."""
    knowledge_path = "system_knowledge.json"
    if os.path.exists(knowledge_path):
        try:
            with open(knowledge_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            return {"error": f"Failed to load system knowledge: {str(e)}"}
    return {}

def ask_groq_assistant(conversation_history):
    """
    Sends conversation history with injected system knowledge to Groq API.
    conversation_history: list of {"role": "user"|"assistant", "content": str}
    """
    # Re-check .env in case user just created it without restarting
    load_env_file()
    
    api_key = os.environ.get("GROQ_API_KEY", "").strip()
    model = os.environ.get("GROQ_MODEL", "openai/gpt-oss-20b").strip()

    if not api_key or api_key == "your_groq_api_key_here":
        return {
            "success": False,
            "error": "Groq API key not found or still set to placeholder. Please create a .env file from .env.example and set your GROQ_API_KEY."
        }

    knowledge = load_system_knowledge()
    system_prompt = (
        "You are FormPilot AI, the expert built-in assistant for FormPilot — Google Forms Intelligent Automation Studio. "
        "You have complete and authoritative knowledge of FormPilot's architecture, mathematical algorithms, "
        "and operation guidelines. Ground your explanations in the following System Knowledge:\n\n"
        f"{json.dumps(knowledge, indent=2)}\n\n"
        "Instructions:\n"
        "- Answer the user's questions clearly, concisely, and accurately.\n"
        "- When explaining how ratings or delay gaps are extrapolated, highlight the Hare-Niemeyer / Largest Remainder Method, "
        "and reassure the user that FormPilot strictly uses their chosen sample ratings (never guessing unchosen ratings), "
        "and that the final dataset is shuffled to prevent continuous robotic patterns.\n"
        "- If the user asks about Google Forms errors (e.g. 404 or Sign-in required), give clear actionable steps "
        "(e.g. disabling 'Limit to 1 response' or copying link from the Send dialog).\n"
        "- Format code, numbers, and key terms in markdown backticks."
    )

    messages = [{"role": "system", "content": system_prompt}]
    # Append last 10 messages from conversation history
    for msg in conversation_history[-10:]:
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
        "temperature": 0.4,
        "max_tokens": 1024
    }

    try:
        res = requests.post(url, headers=headers, json=payload, timeout=30)
        if res.status_code != 200:
            err_detail = res.text
            try:
                err_json = res.json()
                err_detail = err_json.get("error", {}).get("message", err_detail)
            except Exception:
                pass
            return {
                "success": False,
                "error": f"Groq API returned HTTP {res.status_code}: {err_detail}"
            }

        data = res.json()
        reply = data["choices"][0]["message"]["content"]
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

