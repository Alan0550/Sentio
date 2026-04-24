import json
import re

from services.text_analyzer  import analyze_text
from services.image_analyzer import extract_image_urls, analyze_images
from services.scraper        import scrape_url
from services.score_engine   import calculate_score
from services.history        import save_analysis, get_recent
from services.brave_search   import search_headline
from services.media_validator import validate_url, validate_mentions


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
        return _handle_history()

    return _handle_analyze(event)


def _handle_analyze(event):
    try:
        body       = json.loads(event.get("body") or "{}")
        user_input = body.get("input", "").strip()
    except json.JSONDecodeError:
        return _error(400, "Body inválido. Se esperaba JSON con campo 'input'.")

    if not user_input:
        return _error(400, "El campo 'input' no puede estar vacío.")

    if len(user_input) < 20:
        return _error(400, "El texto es demasiado corto para analizarlo.")

    # ── 1. Obtener texto e imágenes ───────────────────────────────────────────
    input_type  = "url" if _is_url(user_input) else "text"
    article_url = user_input if input_type == "url" else ""

    if input_type == "url":
        scraped = scrape_url(user_input)
        if not scraped["success"]:
            return _error(422, f"No se pudo acceder a la URL: {scraped['error']}")
        text       = scraped["text"]
        image_urls = scraped["images"]
    else:
        text       = user_input
        image_urls = extract_image_urls(user_input)

    if len(text) < 20:
        return _error(422, "No se encontró suficiente texto para analizar.")

    # ── 2. Analizar texto — Comprehend ────────────────────────────────────────
    text_analysis = analyze_text(text)

    # ── 3. Búsqueda web — Brave Search (falla silenciosamente) ───────────────
    text_analysis["web_results"] = search_headline(text)

    # ── 4. Validación de medios ───────────────────────────────────────────────
    text_analysis["media_validation"] = {
        "url_check": validate_url(article_url),
        "mentions":  validate_mentions(text),
    }

    # ── 5. Analizar imágenes — Rekognition ────────────────────────────────────
    image_analysis = analyze_images(image_urls)

    # ── 6. Calcular score — Bedrock ───────────────────────────────────────────
    result               = calculate_score(text_analysis, image_analysis, text)
    result["input_type"] = input_type

    # ── 7. Guardar en DynamoDB ────────────────────────────────────────────────
    analysis_id   = save_analysis(user_input, result)
    result["id"]  = analysis_id

    return {
        "statusCode": 200,
        "headers":    HEADERS,
        "body":       json.dumps(result, ensure_ascii=False),
    }


def _handle_history():
    items = get_recent(limit=10)
    return {
        "statusCode": 200,
        "headers":    HEADERS,
        "body":       json.dumps(items, ensure_ascii=False),
    }


def _is_url(text: str) -> bool:
    return bool(re.match(r"^https?://", text, re.IGNORECASE))


def _error(status: int, message: str) -> dict:
    return {
        "statusCode": status,
        "headers":    HEADERS,
        "body":       json.dumps({"error": message}, ensure_ascii=False),
    }
