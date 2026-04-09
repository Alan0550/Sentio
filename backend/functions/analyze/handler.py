import json
import re

from services.text_analyzer  import analyze_text
from services.image_analyzer import extract_image_urls, analyze_images
from services.scraper        import scrape_url
from services.score_engine   import calculate_score


HEADERS = {
    "Content-Type":                 "application/json",
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
}


def lambda_handler(event, context):
    """
    Endpoint POST /analyze
    Body esperado: { "input": "<url o texto>" }
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": HEADERS, "body": ""}

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
    input_type = "url" if _is_url(user_input) else "text"

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

    # ── 2. Analizar texto (Comprehend mock → real con boto3) ──────────────────
    text_analysis = analyze_text(text)

    # ── 3. Analizar imágenes (Rekognition mock → real con boto3) ─────────────
    image_analysis = analyze_images(image_urls)

    # ── 4. Calcular score (Bedrock mock → real con boto3) ─────────────────────
    result             = calculate_score(text_analysis, image_analysis)
    result["input_type"] = input_type

    return {
        "statusCode": 200,
        "headers":    HEADERS,
        "body":       json.dumps(result, ensure_ascii=False),
    }


def _is_url(text: str) -> bool:
    return bool(re.match(r"^https?://", text, re.IGNORECASE))


def _error(status: int, message: str) -> dict:
    return {
        "statusCode": status,
        "headers":    HEADERS,
        "body":       json.dumps({"error": message}, ensure_ascii=False),
    }
