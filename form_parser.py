import re
import json
import urllib.parse
import requests

def normalize_form_url(url):
    """
    Normalizes any Google Form URL variant:
    - forms.gle short links
    - /viewform?usp=...
    - /edit?usp=...
    - /prefill?...
    - /formResponse
    """
    url = url.strip()

    # Short links like https://forms.gle/XXXX should be fetched directly (they 302 redirect)
    if "forms.gle/" in url:
        return url

    # Already has viewform somewhere in path
    if "/viewform" in url:
        return url

    # Handle /edit URLs
    if "/edit" in url:
        return re.sub(r'/edit(\?.*)?$', r'/viewform\1', url)

    # Handle /formResponse URLs
    if "/formResponse" in url:
        return re.sub(r'/formResponse(\?.*)?$', r'/viewform\1', url)

    # Handle /prefill URLs
    if "/prefill" in url:
        return re.sub(r'/prefill(\?.*)?$', r'/viewform\1', url)

    # Generic Google form link
    if "docs.google.com/forms" in url:
        if "?" in url:
            base, query = url.split("?", 1)
            return base.rstrip("/") + "/viewform?" + query
        else:
            return url.rstrip("/") + "/viewform"

    return url


def parse_google_form(url_or_html):
    """
    Parses a Google Form URL or raw HTML string.
    Extracts:
    - Form title, description
    - Submit URL (/formResponse)
    - Sections and pageHistory
    - Questions (entry IDs, titles, types, options, grid rows)
    """
    html = ""
    resolved_url = ""

    # Check if input is a URL
    if url_or_html.strip().startswith("http://") or url_or_html.strip().startswith("https://"):
        target_url = normalize_form_url(url_or_html)
        
        session = requests.Session()
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Cache-Control": "max-age=0",
            "Upgrade-Insecure-Requests": "1"
        }
        
        try:
            res = session.get(target_url, headers=headers, timeout=25, allow_redirects=True)
            resolved_url = res.url
        except Exception as e:
            raise ValueError(f"Failed to connect to Google Form: {str(e)}")

        if res.status_code == 404:
            raise ValueError(
                f"Google returned HTTP 404 (Not Found) for: {target_url}\n"
                f"Please verify: In Google Forms, click 'Send' (top right) -> Link tab -> Copy link."
            )
        elif res.status_code != 200:
            raise ValueError(f"Google returned HTTP {res.status_code} when loading form: {target_url}")

        html = res.text
    else:
        html = url_or_html

    # Check for private / permission denied indicators
    if "You need permission" in html or "This form can only be viewed by users in the owner's organization" in html:
        raise ValueError("This Google Form requires organization login permission. Please change form settings: Untick 'Restrict to users in [Organization]'.")
    
    if "Sign in to continue to Forms" in html and "ServiceLogin" in html and "FB_PUBLIC_LOAD_DATA_" not in html:
        raise ValueError("This Google Form requires Google Sign-In (e.g. 'Limit to 1 response' is enabled). Please turn off 'Limit to 1 response' in form Settings.")

    # Extract FB_PUBLIC_LOAD_DATA_
    match = re.search(r'var\s+FB_PUBLIC_LOAD_DATA_\s*=\s*(.*?);\s*</script>', html, re.DOTALL)
    if not match:
        match = re.search(r'FB_PUBLIC_LOAD_DATA_\s*=\s*(\[.*?\]);\s*', html, re.DOTALL)
        if not match:
            raise ValueError("Could not locate form data structure (FB_PUBLIC_LOAD_DATA_). Ensure this is a valid public Google Form.")

    try:
        raw_data = json.loads(match.group(1))
    except Exception as e:
        raise ValueError(f"Failed to parse form JSON data: {str(e)}")

    meta = raw_data[1]
    title = meta[8] if len(meta) > 8 and meta[8] else (meta[0] if len(meta) > 0 else "Untitled Form")
    description = meta[0] if len(meta) > 0 and meta[0] != title else ""

    # Derive submit URL
    action_match = re.search(r'<form action="([^"]+formResponse)"', html)
    if action_match:
        submit_url = action_match.group(1)
        if submit_url.startswith("/"):
            submit_url = "https://docs.google.com" + submit_url
    elif resolved_url and "/forms/d/e/" in resolved_url:
        submit_url = re.sub(r'/(viewform|prefill).*$', '/formResponse', resolved_url)
        if not submit_url.endswith("/formResponse"):
            submit_url = submit_url.rstrip("/") + "/formResponse"
    else:
        form_id_match = re.search(r'/forms/d/e/([a-zA-Z0-9_-]+)/', resolved_url or url_or_html)
        if form_id_match:
            submit_url = f"https://docs.google.com/forms/d/e/{form_id_match.group(1)}/formResponse"
        else:
            submit_url = ""

    items_data = meta[1] if len(meta) > 1 and meta[1] else []

    questions = []
    sections = [0]
    current_section = 0
    current_section_title = ""

    for item in items_data:
        if not item:
            continue
            
        q_id = item[0]
        raw_title = item[1]
        q_desc = item[2] or ""
        q_type_code = item[3] if len(item) > 3 else None
        q_payload = item[4] if len(item) > 4 else None

        # Type 8 is Page Break / Section
        if q_type_code == 8:
            current_section += 1
            sections.append(current_section)
            current_section_title = raw_title or f"Section {current_section + 1}"
            continue

        if not q_payload:
            continue

        # Clean title
        if raw_title:
            q_title = raw_title.strip()
        elif current_section_title:
            q_title = current_section_title
        else:
            q_title = f"Question {len(questions) + 1}"

        # Clean up multi-line title for nicer display if needed
        # e.g., "Part I. Respondent's Profile\nCollege/Department (Required):"
        display_title = q_title.replace("\n", " — ")

        # Type 0: Short text, Type 1: Paragraph text
        if q_type_code in (0, 1):
            entry_id = f"entry.{q_payload[0][0]}"
            questions.append({
                "id": str(q_id),
                "title": display_title,
                "description": q_desc,
                "type": "text",
                "subtype": "short_answer" if q_type_code == 0 else "paragraph",
                "entry_id": entry_id,
                "section": current_section,
                "default_pool": [
                    "COT", "College of Technologies", "cot", "Cot",
                    "COB", "College of Business","cob", "Cob",
                    "cas", "College of Arts and Sciences", "CAS", "Cas",
                    "Coe", "College of Education", "COE","coe"
                    "con", "College of Nursing", "CON","Con",
                    "cpag", "College of Public Administration and Governance", "CPAG","Cpag", "college of public ad",
                ] if ("department" in display_title.lower() or "college" in display_title.lower()) else []
            })

        # Type 2: Multiple Choice, Type 3: Dropdown
        elif q_type_code in (2, 3):
            entry_id = f"entry.{q_payload[0][0]}"
            options = []
            if len(q_payload[0]) > 1 and q_payload[0][1]:
                options = [opt[0] for opt in q_payload[0][1] if opt and opt[0]]
            questions.append({
                "id": str(q_id),
                "title": display_title,
                "description": q_desc,
                "type": "choice",
                "subtype": "multiple_choice" if q_type_code == 2 else "dropdown",
                "entry_id": entry_id,
                "options": options,
                "section": current_section
            })

        # Type 4: Checkboxes
        elif q_type_code == 4:
            entry_id = f"entry.{q_payload[0][0]}"
            options = []
            if len(q_payload[0]) > 1 and q_payload[0][1]:
                options = [opt[0] for opt in q_payload[0][1] if opt and opt[0]]
            questions.append({
                "id": str(q_id),
                "title": display_title,
                "description": q_desc,
                "type": "checkbox",
                "entry_id": entry_id,
                "options": options,
                "section": current_section
            })

        # Type 5: Linear scale (e.g. 1 to 5)
        elif q_type_code == 5:
            entry_id = f"entry.{q_payload[0][0]}"
            scale_options = []
            if len(q_payload[0]) > 1 and q_payload[0][1]:
                scale_options = [opt[0] for opt in q_payload[0][1] if opt and opt[0]]
            if not scale_options:
                scale_options = ["1", "2", "3", "4", "5"]
                
            questions.append({
                "id": str(q_id),
                "title": display_title,
                "description": q_desc,
                "type": "linear_scale",
                "entry_id": entry_id,
                "options": scale_options,
                "section": current_section
            })

        # Type 7: Multiple-Choice Grid / Likert Grid
        elif q_type_code == 7:
            grid_rows = []
            columns = []
            for sub in q_payload:
                row_entry_id = f"entry.{sub[0]}"
                row_title = sub[3][0] if len(sub) > 3 and sub[3] and len(sub[3]) > 0 else f"Row {len(grid_rows) + 1}"
                if not columns and len(sub) > 1 and sub[1]:
                    columns = [opt[0] for opt in sub[1] if opt and opt[0]]
                grid_rows.append({
                    "entry_id": row_entry_id,
                    "row_title": row_title
                })
            
            if not columns:
                columns = ["1", "2", "3", "4", "5"]

            questions.append({
                "id": str(q_id),
                "title": display_title,
                "description": q_desc,
                "type": "multiple_choice_grid",
                "columns": columns,
                "rows": grid_rows,
                "section": current_section
            })

    page_history = ",".join(str(s) for s in sections)

    return {
        "title": title,
        "description": description,
        "submit_url": submit_url,
        "sections": sections,
        "page_history": page_history,
        "questions": questions
    }
