"""
Handler principal — Sentio
Análisis de feedback empresarial con NPS inferido,
aspectos por sentimiento y riesgo de churn.
"""

import json
import time
import uuid

from services.text_analyzer import analyze_text
from services.score_engine  import analyze_feedback
from services.history       import save_analysis, get_recent


HEADERS = {
    "Content-Type":                 "application/json",
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
}


def lambda_handler(event, context):
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": HEADERS, "body": ""}

    path   = event.get("path", "/analyze")
    method = event.get("httpMethod", "POST")

    if path == "/history" and method == "GET":
        return _handle_history(event)

    if path == "/analyze/batch" and method == "POST":
        return _handle_batch(event)

    return _handle_analyze(event)


def _handle_analyze(event):
    try:
        body        = json.loads(event.get("body") or "{}")
        user_input  = body.get("input", "").strip()
        source      = body.get("source", "manual")
        customer_id = body.get("customer_id", None)
        org_id      = body.get("org_id", "default")
    except json.JSONDecodeError:
        return _error(400, "Body inválido. Se esperaba JSON con campo 'input'.")

    if not user_input:
        return _error(400, "El campo 'input' no puede estar vacío.")
    if len(user_input) < 10:
        return _error(400, "El feedback es demasiado corto para analizarlo.")
    if len(user_input) > 5000:
        return _error(400, "El feedback supera el límite de 5000 caracteres.")

    comprehend_result = analyze_text(user_input)
    result = analyze_feedback(user_input, comprehend_result)

    result["source"]      = source
    result["customer_id"] = customer_id
    result["org_id"]      = org_id
    result["input"]       = user_input[:300]

    analysis_id  = save_analysis(user_input, result)
    result["id"] = analysis_id

    return {
        "statusCode": 200,
        "headers":    HEADERS,
        "body":       json.dumps(result, ensure_ascii=False),
    }


def _handle_batch(event):
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _error(400, "Body inválido. Se esperaba JSON.")

    feedbacks   = body.get("feedbacks", [])
    org_id      = body.get("org_id", "default")
    source      = body.get("source", "batch")

    if not isinstance(feedbacks, list) or len(feedbacks) == 0:
        return _error(400, "El campo 'feedbacks' debe ser una lista no vacía.")
    if len(feedbacks) > 50:
        return _error(400, "El batch no puede superar 50 feedbacks.")

    batch_id = str(uuid.uuid4())
    results  = []
    failed   = 0

    promoters   = 0
    passives    = 0
    detractors  = 0
    high_churn  = 0
    urgent      = 0

    print(f"[batch] Iniciando batch_id={batch_id} — {len(feedbacks)} feedbacks")

    for i, fb in enumerate(feedbacks):
        user_input  = (fb.get("input") or "").strip()
        customer_id = fb.get("customer_id", None)

        if not user_input or len(user_input) < 10 or len(user_input) > 5000:
            results.append({
                "index":       i,
                "customer_id": customer_id,
                "error":       "Texto inválido (vacío, muy corto o muy largo)",
            })
            failed += 1
            continue

        try:
            comprehend_result = analyze_text(user_input)
            result = analyze_feedback(user_input, comprehend_result)

            result["source"]      = source
            result["customer_id"] = customer_id
            result["org_id"]      = org_id
            result["input"]       = user_input[:300]

            analysis_id  = save_analysis(user_input, result)
            result["id"] = analysis_id
            result["index"] = i

            nps = result.get("nps_classification", "pasivo")
            if nps == "promotor":  promoters  += 1
            elif nps == "detractor": detractors += 1
            else:                  passives   += 1
            if result.get("churn_risk") == "alto": high_churn += 1
            if result.get("urgency"):              urgent     += 1

            results.append(result)
            print(f"[batch] {i+1}/{len(feedbacks)} OK — nps={nps}")

        except Exception as e:
            print(f"[batch] {i+1}/{len(feedbacks)} ERROR: {e}")
            results.append({
                "index":       i,
                "customer_id": customer_id,
                "error":       str(e),
            })
            failed += 1

        if i < len(feedbacks) - 1:
            time.sleep(0.5)

    total_ok = len(feedbacks) - failed
    nps_score = round(((promoters - detractors) / total_ok) * 100) if total_ok > 0 else 0

    summary = {
        "promoters":      promoters,
        "passives":       passives,
        "detractors":     detractors,
        "nps_score":      nps_score,
        "high_churn_count": high_churn,
        "urgent_count":   urgent,
    }

    print(f"[batch] Completado — procesados={total_ok} fallidos={failed} nps={nps_score}")

    return {
        "statusCode": 200,
        "headers":    HEADERS,
        "body":       json.dumps({
            "batch_id":  batch_id,
            "total":     len(feedbacks),
            "processed": total_ok,
            "failed":    failed,
            "results":   results,
            "summary":   summary,
        }, ensure_ascii=False),
    }


def _handle_history(event):
    params = event.get("queryStringParameters") or {}
    org_id = params.get("org_id", None)
    items  = get_recent(limit=20, org_id=org_id)
    return {
        "statusCode": 200,
        "headers":    HEADERS,
        "body":       json.dumps(items, ensure_ascii=False),
    }


def _error(status: int, message: str) -> dict:
    return {
        "statusCode": status,
        "headers":    HEADERS,
        "body":       json.dumps({"error": message}, ensure_ascii=False),
    }
