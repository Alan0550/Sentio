"""
Handler principal — Sentio
Análisis de feedback empresarial con NPS inferido,
aspectos por sentimiento y riesgo de churn.
"""

import json
import time
import uuid
import base64
from decimal import Decimal

class _JSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        return super().default(obj)

def _dumps(obj, **_):
    return json.dumps(obj, ensure_ascii=False, cls=_JSONEncoder)

from services.text_analyzer  import analyze_text
from services.score_engine   import analyze_feedback
from services.history        import save_analysis, get_recent, get_batch_summary
from services.csv_processor  import parse_csv
from services.batch_processor import process_batch
from services.aggregator     import get_period_metrics, get_trend, compare_periods


HEADERS = {
    "Content-Type":                 "application/json",
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Headers": "Content-Type,Content-Type",
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

    if path == "/upload/csv" and method == "POST":
        return _handle_upload_csv(event)

    if path.startswith("/batch/") and method == "GET":
        batch_id = event.get("pathParameters", {}).get("batch_id") or path.split("/batch/")[-1]
        return _handle_get_batch(batch_id)

    if path == "/dashboard/compare" and method == "GET":
        return _handle_dashboard_compare(event)

    if path == "/dashboard" and method == "GET":
        return _handle_dashboard(event)

    return _handle_analyze(event)


# ── Endpoints existentes ──────────────────────────────────────────────────────

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
        "body":       _dumps(result, ensure_ascii=False),
    }


def _handle_batch(event):
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _error(400, "Body inválido. Se esperaba JSON.")

    feedbacks = body.get("feedbacks", [])
    org_id    = body.get("org_id", "default")
    source    = body.get("source", "batch")

    if not isinstance(feedbacks, list) or len(feedbacks) == 0:
        return _error(400, "El campo 'feedbacks' debe ser una lista no vacía.")
    if len(feedbacks) > 50:
        return _error(400, "El batch no puede superar 50 feedbacks.")

    batch_id = str(uuid.uuid4())
    results  = []
    failed   = 0
    promoters = passives = detractors = high_churn = urgent = 0

    print(f"[batch] Iniciando batch_id={batch_id} — {len(feedbacks)} feedbacks")

    for i, fb in enumerate(feedbacks):
        user_input  = (fb.get("input") or "").strip()
        customer_id = fb.get("customer_id", None)

        if not user_input or len(user_input) < 10 or len(user_input) > 5000:
            results.append({"index": i, "customer_id": customer_id, "error": "Texto inválido"})
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
            if nps == "promotor":    promoters  += 1
            elif nps == "detractor": detractors += 1
            else:                    passives   += 1
            if result.get("churn_risk") == "alto": high_churn += 1
            if result.get("urgency"):              urgent     += 1
            results.append(result)
        except Exception as e:
            print(f"[batch] {i+1} ERROR: {e}")
            results.append({"index": i, "customer_id": customer_id, "error": str(e)})
            failed += 1

        if i < len(feedbacks) - 1:
            time.sleep(0.5)

    total_ok  = len(feedbacks) - failed
    nps_score = round(((promoters - detractors) / total_ok) * 100) if total_ok > 0 else 0
    summary   = {
        "promoters": promoters, "passives": passives, "detractors": detractors,
        "nps_score": nps_score, "high_churn_count": high_churn, "urgent_count": urgent,
    }

    return {
        "statusCode": 200,
        "headers":    HEADERS,
        "body":       _dumps({
            "batch_id": batch_id, "total": len(feedbacks),
            "processed": total_ok, "failed": failed,
            "results": results, "summary": summary,
        }, ensure_ascii=False),
    }


def _handle_history(event):
    params = event.get("queryStringParameters") or {}
    org_id = params.get("org_id", None)
    items  = get_recent(limit=20, org_id=org_id)
    return {
        "statusCode": 200,
        "headers":    HEADERS,
        "body":       _dumps(items, ensure_ascii=False),
    }


# ── Endpoints nuevos ──────────────────────────────────────────────────────────

def _handle_upload_csv(event):
    print("[csv] Recibiendo archivo CSV")
    try:
        file_bytes, org_id = _extract_multipart(event)
    except Exception as e:
        return _error(400, f"No se pudo leer el archivo: {e}")

    if not file_bytes:
        return _error(400, "No se encontró el archivo en el request.")

    parsed = parse_csv(file_bytes)
    if not parsed["success"]:
        return _error(400, f"CSV inválido: {'; '.join(parsed['errors'])}")

    rows = parsed["rows"]
    if not rows:
        return _error(400, "No se encontraron filas válidas en el CSV.")

    print(f"[csv] {len(rows)} filas válidas — iniciando análisis")
    batch_id = str(uuid.uuid4())
    result   = process_batch(rows, org_id=org_id, batch_id=batch_id)

    return {
        "statusCode": 200,
        "headers":    HEADERS,
        "body":       _dumps(result, ensure_ascii=False),
    }


def _handle_get_batch(batch_id: str):
    if not batch_id:
        return _error(400, "batch_id es requerido.")

    item = get_batch_summary(batch_id)
    if item is None:
        return _error(404, f"Batch '{batch_id}' no encontrado.")

    return {
        "statusCode": 200,
        "headers":    HEADERS,
        "body":       _dumps(item, ensure_ascii=False),
    }


def _handle_dashboard(event):
    from datetime import datetime, timedelta, timezone
    params  = event.get("queryStringParameters") or {}
    org_id  = params.get("org_id", "default")
    period  = params.get("period")
    periods = params.get("periods")

    if period:
        data = get_period_metrics(org_id, period)
        return {
            "statusCode": 200, "headers": HEADERS,
            "body": _dumps({"type": "period", "org_id": org_id, "data": data}),
        }

    if periods:
        period_list = [p.strip() for p in periods.split(",") if p.strip()]
    else:
        now = datetime.now(timezone.utc)
        seen, period_list = set(), []
        for i in range(5, -1, -1):
            d = (now.replace(day=1) - timedelta(days=i * 30))
            p = d.strftime("%Y-%m")
            if p not in seen:
                seen.add(p)
                period_list.append(p)

    data = get_trend(org_id, period_list)
    return {
        "statusCode": 200, "headers": HEADERS,
        "body": _dumps({"type": "trend", "org_id": org_id, "periods": period_list, "data": data}),
    }


def _handle_dashboard_compare(event):
    params   = event.get("queryStringParameters") or {}
    org_id   = params.get("org_id", "default")
    period_a = params.get("period_a")
    period_b = params.get("period_b")

    if not period_a or not period_b:
        return _error(400, "Se requieren 'period_a' y 'period_b' en formato YYYY-MM.")

    data = compare_periods(org_id, period_a, period_b)
    return {
        "statusCode": 200, "headers": HEADERS,
        "body": _dumps(data),
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_multipart(event) -> tuple[bytes, str]:
    """
    Parser manual de multipart/form-data.
    Reemplaza cgi.FieldStorage (deprecado en Python 3.11+, falla en Lambda).
    """
    headers      = event.get("headers") or {}
    content_type = headers.get("content-type") or headers.get("Content-Type") or ""
    raw_body     = event.get("body") or ""

    # API Gateway base64-encodea el body cuando BinaryMediaTypes está configurado
    if event.get("isBase64Encoded"):
        body_bytes = base64.b64decode(raw_body)
    else:
        body_bytes = raw_body.encode("latin-1")  # latin-1 preserva bytes 1:1

    # Extraer boundary del Content-Type
    boundary = None
    for segment in content_type.split(";"):
        segment = segment.strip()
        if segment.lower().startswith("boundary="):
            boundary = segment[9:].strip('"')
            break

    if not boundary:
        raise ValueError(f"No se encontró boundary en Content-Type: {content_type}")

    sep        = f"--{boundary}".encode()
    file_bytes = None
    org_id     = "default"

    for part in body_bytes.split(sep)[1:]:
        if part.strip() in (b"--", b"--\r\n", b""):
            break

        # Separar headers del contenido
        if b"\r\n\r\n" not in part:
            continue
        part_headers_raw, content = part.split(b"\r\n\r\n", 1)

        # Quitar \r\n final del contenido
        if content.endswith(b"\r\n"):
            content = content[:-2]

        part_headers = part_headers_raw.decode("utf-8", errors="replace")

        # Extraer name del Content-Disposition
        name = None
        for line in part_headers.splitlines():
            if "Content-Disposition" in line:
                for token in line.split(";"):
                    token = token.strip()
                    if token.lower().startswith("name="):
                        name = token[5:].strip('"')

        if name == "file":
            file_bytes = content
        elif name == "org_id":
            org_id = content.decode("utf-8", errors="replace").strip()

    if file_bytes is None:
        raise ValueError("Campo 'file' no encontrado en el form-data")

    return file_bytes, org_id


def _error(status: int, message: str) -> dict:
    return {
        "statusCode": status,
        "headers":    HEADERS,
        "body":       _dumps({"error": message}, ensure_ascii=False),
    }
