import random
import math

def calculate_scaled_distribution(sample_counts, target_total):
    """
    Given a dict of {option: count} where sum(counts) > 0,
    scales up (or down) to target_total using Largest Remainder Method (Hare-Niemeyer)
    so sum of final counts exactly equals target_total.
    Returns: dict {option: final_count}
    """
    sample_total = sum(sample_counts.values())
    if sample_total == 0:
        return {opt: 0 for opt in sample_counts}

    # Calculate exact floats and integer floors
    proportions = {}
    floors = {}
    remainders = {}

    for opt, count in sample_counts.items():
        if count <= 0:
            floors[opt] = 0
            remainders[opt] = 0.0
            continue
        exact = (count / sample_total) * target_total
        floor_val = math.floor(exact)
        floors[opt] = floor_val
        remainders[opt] = exact - floor_val

    # How many items left to distribute?
    allocated = sum(floors.values())
    leftover = target_total - allocated

    sorted_by_remainder = sorted(remainders.items(), key=lambda x: x[1], reverse=True)

    final_counts = floors.copy()
    for i in range(leftover):
        opt = sorted_by_remainder[i % len(sorted_by_remainder)][0]
        final_counts[opt] += 1

    return final_counts


def generate_delay_schedule(delay_rules, target_respondents):
    """
    delay_rules: list of dicts:
      [
        {"duration_seconds": 300, "count": 2, "label": "5 min"},
        {"duration_seconds": 120, "count": 3, "label": "2 min"},
        ...
      ]
    target_respondents: int (e.g. 50)
    Generates target_respondents - 1 delay intervals between submissions.
    """
    total_intervals = max(0, target_respondents - 1)
    if total_intervals == 0:
        return {
            "schedule": [],
            "total_estimated_seconds": 0,
            "scaled_breakdown": [],
            "warning": None
        }

    active_rules = [r for r in delay_rules if r.get("count", 0) > 0 and r.get("duration_seconds", 0) > 0]

    if not active_rules:
        # Default jitter: 1.5s - 2.5s
        default_schedule = [round(random.uniform(1.5, 2.5), 1) for _ in range(total_intervals)]
        return {
            "schedule": default_schedule,
            "total_estimated_seconds": round(sum(default_schedule), 1),
            "scaled_breakdown": [{"label": "Default Safe Delay (1.5s - 2.5s)", "count": total_intervals}],
            "warning": None
        }

    sample_counts = {str(i): int(r["count"]) for i, r in enumerate(active_rules)}
    sample_total = sum(sample_counts.values())
    warning = None

    if sample_total < total_intervals:
        warning = f"Configured delay sample counts total {sample_total}, scaled to {total_intervals} respondent intervals."
        scaled = calculate_scaled_distribution(sample_counts, total_intervals)
    elif sample_total == total_intervals:
        scaled = sample_counts
    else:
        scaled = calculate_scaled_distribution(sample_counts, total_intervals)

    schedule = []
    scaled_breakdown = []
    for idx_str, count in scaled.items():
        if count <= 0:
            continue
        r = active_rules[int(idx_str)]
        base_sec = float(r["duration_seconds"])
        label = r.get("label") or (f"{int(base_sec//60)}m" if base_sec >= 60 else f"{int(base_sec)}s")
        scaled_breakdown.append({
            "label": label,
            "base_seconds": base_sec,
            "count": count
        })
        for _ in range(count):
            # Humanized jitter: ±4%
            jitter = random.uniform(-0.04, 0.04) * base_sec
            final_sec = max(0.5, round(base_sec + jitter, 1))
            schedule.append(final_sec)

    # Shuffle the delays so fast and slow gaps are realistically interspersed
    random.shuffle(schedule)

    return {
        "schedule": schedule,
        "total_estimated_seconds": round(sum(schedule), 1),
        "scaled_breakdown": scaled_breakdown,
        "warning": warning
    }


def generate_respondents_dataset(schema, user_config, target_respondents):
    """
    Generates dataset for `target_respondents` respondents.
    schema: The parsed Google Form schema (questions, entry_ids, page_history)
    user_config: User's configured answers, pools, and counts per question/row
    target_respondents: int
    """
    warnings = []
    columns_data = {}
    readable_columns = {}

    questions = schema.get("questions", [])
    config_questions = user_config.get("questions", {})

    for q in questions:
        q_id = q.get("id")
        q_type = q.get("type")
        cfg = config_questions.get(q_id, {})

        if q_type == "text":
            entry_id = q.get("entry_id")
            title = q.get("title")
            pool = cfg.get("pool", q.get("default_pool", []))
            
            if not pool:
                fallback_val = cfg.get("value", "N/A")
                pool = [fallback_val]

            answers = []
            while len(answers) < target_respondents:
                shuffled_pool = list(pool)
                random.shuffle(shuffled_pool)
                answers.extend(shuffled_pool)
            
            answers = answers[:target_respondents]
            random.shuffle(answers)
            columns_data[entry_id] = answers
            readable_columns[entry_id] = { "title": title, "answers": answers }

        elif q_type in ("choice", "linear_scale"):
            entry_id = q.get("entry_id")
            title = q.get("title")
            options = q.get("options", ["1", "2", "3", "4", "5"])
            
            sample_counts = cfg.get("counts", {})
            active_counts = {str(opt): int(sample_counts.get(str(opt), 0)) for opt in options if int(sample_counts.get(str(opt), 0)) > 0}
            sample_total = sum(active_counts.values())

            if sample_total == 0:
                answers = [random.choice(options) for _ in range(target_respondents)]
            elif sample_total == target_respondents:
                answers = []
                for opt, count in active_counts.items():
                    answers.extend([opt] * count)
                random.shuffle(answers)
            else:
                warnings.append({
                    "question_id": q_id,
                    "title": title,
                    "sample_total": sample_total,
                    "target_respondents": target_respondents,
                    "message": f"Sample counts for '{title}' total {sample_total}, scaled to {target_respondents} respondents based on proportions."
                })
                scaled = calculate_scaled_distribution(active_counts, target_respondents)
                answers = []
                for opt, count in scaled.items():
                    answers.extend([opt] * count)
                random.shuffle(answers)

            columns_data[entry_id] = answers
            readable_columns[entry_id] = { "title": title, "answers": answers }

        elif q_type == "multiple_choice_grid":
            grid_title = q.get("title")
            columns = q.get("columns", ["1", "2", "3", "4", "5"])
            rows = q.get("rows", [])
            row_configs = cfg.get("rows", {})

            for row in rows:
                row_entry_id = row.get("entry_id")
                row_title = row.get("row_title")
                full_title = f"{grid_title} - {row_title}"
                
                row_cfg = row_configs.get(row_entry_id, {})
                sample_counts = row_cfg.get("counts", {})
                
                active_counts = {str(opt): int(sample_counts.get(str(opt), 0)) for opt in columns if int(sample_counts.get(str(opt), 0)) > 0}
                sample_total = sum(active_counts.values())

                if sample_total == 0:
                    answers = [random.choice(columns) for _ in range(target_respondents)]
                elif sample_total == target_respondents:
                    answers = []
                    for opt, count in active_counts.items():
                        answers.extend([opt] * count)
                    random.shuffle(answers)
                else:
                    warnings.append({
                        "question_id": q_id,
                        "row_entry_id": row_entry_id,
                        "title": full_title,
                        "sample_total": sample_total,
                        "target_respondents": target_respondents,
                        "message": f"Sample counts for '{full_title}' total {sample_total}, scaled to {target_respondents} respondents."
                    })
                    scaled = calculate_scaled_distribution(active_counts, target_respondents)
                    answers = []
                    for opt, count in scaled.items():
                        answers.extend([opt] * count)
                    random.shuffle(answers)

                columns_data[row_entry_id] = answers
                readable_columns[row_entry_id] = { "title": full_title, "answers": answers }

    # Assemble into respondents list
    page_history = schema.get("page_history", "0")
    respondents = []
    
    for i in range(target_respondents):
        payload = {}
        if page_history:
            payload["pageHistory"] = page_history
            
        readable = {}
        for entry_id, col_answers in columns_data.items():
            val = col_answers[i]
            payload[entry_id] = val
            q_info = readable_columns.get(entry_id, {})
            readable[q_info.get("title", entry_id)] = val

        respondents.append({
            "respondent_id": i + 1,
            "payload": payload,
            "readable": readable
        })

    # Generate delay schedule if rules present
    delay_rules = user_config.get("delay_rules", [])
    delay_info = generate_delay_schedule(delay_rules, target_respondents)
    if delay_info.get("warning"):
        warnings.append({
            "title": "Response Delay Timing",
            "message": delay_info["warning"]
        })

    return {
        "respondents": respondents,
        "warnings": warnings,
        "total": len(respondents),
        "delay_schedule": delay_info["schedule"],
        "delay_summary": {
            "total_estimated_seconds": delay_info["total_estimated_seconds"],
            "scaled_breakdown": delay_info["scaled_breakdown"]
        }
    }
