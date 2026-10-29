import os
import json
from flask import Flask, request, jsonify, render_template, send_from_directory
from form_parser import parse_google_form
from generator import generate_respondents_dataset, calculate_scaled_distribution
from submitter import submitter_instance
from ai_assistant import ask_groq_assistant

app = Flask(__name__, static_folder="static", template_folder="templates")

# In-memory session store for current active schema and plan
CURRENT_STATE = {
    "schema": None,
    "user_config": {},
    "last_generated_plan": None
}

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/scan-form", methods=["POST"])
def api_scan_form():
    data = request.json or {}
    url = data.get("url", "").strip()
    html_content = data.get("html", "").strip()

    if not url and not html_content:
        return jsonify({"success": False, "error": "Please provide a Google Form URL or HTML content."}), 400

    try:
        schema = parse_google_form(url if url else html_content)
        CURRENT_STATE["schema"] = schema
        
        # Save to disk as form_schema.json
        with open("form_schema.json", "w", encoding="utf-8") as f:
            json.dump(schema, f, indent=2)

        return jsonify({
            "success": True,
            "schema": schema,
            "message": f"Successfully parsed form: '{schema['title']}' with {len(schema['questions'])} questions across {len(schema['sections'])} section(s)."
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400


@app.route("/api/load-sample", methods=["GET"])
def api_load_sample():
    """Provides a sample Google Form schema for demonstration & testing."""
    sample_schema = {
        "title": "College Academic & Faculty Evaluation Survey",
        "description": "Annual student feedback on department performance and faculty competence.",
        "submit_url": "https://docs.google.com/forms/d/e/1FAIpQLSc_SAMPLE_FORM_ID/formResponse",
        "sections": [0, 1],
        "page_history": "0,1",
        "questions": [
            {
                "id": "1001",
                "title": "College Department",
                "description": "Please specify your college / department name or abbreviation.",
                "type": "text",
                "subtype": "short_answer",
                "entry_id": "entry.1001001",
                "section": 0,
                "default_pool": [
                    "COT",
                    "College of Technology",
                    "College of Business",
                    "COB",
                    "College of Engineering",
                    "COE",
                    "College of Arts and Sciences",
                    "CAS"
                ]
            },
            {
                "id": "1002",
                "title": "Overall Academic Experience",
                "description": "Rate your overall satisfaction with the curriculum (1 to 5)",
                "type": "linear_scale",
                "entry_id": "entry.1002001",
                "options": ["1", "2", "3", "4", "5"],
                "section": 1
            },
            {
                "id": "1003",
                "title": "Faculty Competence (Likert Scale Grid)",
                "description": "Evaluate faculty performance across key metrics.",
                "type": "multiple_choice_grid",
                "section": 1,
                "columns": [
                    "1 - Strongly Disagree",
                    "2 - Disagree",
                    "3 - Neutral",
                    "4 - Agree",
                    "5 - Strongly Agree"
                ],
                "rows": [
                    {
                        "entry_id": "entry.1003001",
                        "row_title": "Subject Mastery & Knowledge"
                    },
                    {
                        "entry_id": "entry.1003002",
                        "row_title": "Punctuality & Class Attendance"
                    },
                    {
                        "entry_id": "entry.1003003",
                        "row_title": "Fairness in Grading & Evaluation"
                    },
                    {
                        "entry_id": "entry.1003004",
                        "row_title": "Clarity of Instruction & Explanations"
                    }
                ]
            }
        ]
    }
    CURRENT_STATE["schema"] = sample_schema
    with open("form_schema.json", "w", encoding="utf-8") as f:
        json.dump(sample_schema, f, indent=2)

    return jsonify({
        "success": True,
        "schema": sample_schema,
        "message": "Loaded sample survey schema with Likert Grid and Department pool."
    })


@app.route("/api/generate-plan", methods=["POST"])
def api_generate_plan():
    data = request.json or {}
    schema = data.get("schema") or CURRENT_STATE.get("schema")
    user_config = data.get("user_config", {})
    target_respondents = int(data.get("target_respondents", 50))

    if not schema:
        return jsonify({"success": False, "error": "No form schema found. Please scan a form first."}), 400

    try:
        dataset_result = generate_respondents_dataset(schema, user_config, target_respondents)
        CURRENT_STATE["last_generated_plan"] = dataset_result
        
        # Save generated dataset to disk
        with open("generated_respondents.json", "w", encoding="utf-8") as f:
            json.dump(dataset_result, f, indent=2)

        return jsonify({
            "success": True,
            "data": dataset_result,
            "has_warnings": len(dataset_result["warnings"]) > 0,
            "warnings": dataset_result["warnings"],
            "total_respondents": dataset_result["total"]
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 400


@app.route("/api/start-submission", methods=["POST"])
def api_start_submission():
    data = request.json or {}
    submit_url = data.get("submit_url")
    respondents = data.get("respondents")
    min_delay = float(data.get("min_delay", 1.0))
    max_delay = float(data.get("max_delay", 2.5))
    delay_schedule = data.get("delay_schedule")

    if not respondents:
        if CURRENT_STATE.get("last_generated_plan"):
            respondents = CURRENT_STATE["last_generated_plan"].get("respondents", [])
    
    if delay_schedule is None and CURRENT_STATE.get("last_generated_plan"):
        delay_schedule = CURRENT_STATE["last_generated_plan"].get("delay_schedule")

    if not respondents:
        return jsonify({"success": False, "error": "No generated respondents data available. Please generate plan first."}), 400

    if not submit_url:
        schema = CURRENT_STATE.get("schema")
        if schema:
            submit_url = schema.get("submit_url")

    if not submit_url:
        return jsonify({"success": False, "error": "No submission URL found for form."}), 400

    ok, msg = submitter_instance.start(submit_url, respondents, min_delay, max_delay, delay_schedule)
    if ok:
        return jsonify({"success": True, "message": msg})
    return jsonify({"success": False, "error": msg}), 400


@app.route("/api/pause-submission", methods=["POST"])
def api_pause():
    ok, msg = submitter_instance.pause()
    return jsonify({"success": ok, "message": msg})


@app.route("/api/resume-submission", methods=["POST"])
def api_resume():
    ok, msg = submitter_instance.resume()
    return jsonify({"success": ok, "message": msg})


@app.route("/api/stop-submission", methods=["POST"])
def api_stop():
    ok, msg = submitter_instance.stop()
    return jsonify({"success": ok, "message": msg})


@app.route("/api/status", methods=["GET"])
def api_status():
    status = submitter_instance.get_status()
    return jsonify(status)


@app.route("/api/export-config", methods=["POST"])
def api_export_config():
    data = request.json or {}
    with open("user_config.json", "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    return jsonify({"success": True, "message": "Saved config to user_config.json"})


@app.route("/api/ai/chat", methods=["POST"])
def api_ai_chat():
    data = request.json or {}
    messages = data.get("messages", [])
    if not messages:
        return jsonify({"success": False, "error": "No messages provided."}), 400

    result = ask_groq_assistant(messages)
    status_code = 200 if result.get("success") else 400
    return jsonify(result), status_code


if __name__ == "__main__":
    print("\n=======================================================")
    print(" Google Forms Automation Studio is running locally! ")
    print(" Open your browser at: http://127.0.0.1:5000 ")
    print("=======================================================\n")
    app.run(host="127.0.0.1", port=5000, debug=False, threaded=True)

