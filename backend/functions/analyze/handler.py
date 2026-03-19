import json
import re
import urllib.request
import urllib.error


def lambda_handler(event, context):
    """
    Endpoint POST /analyze
    Body esperado: { "input": "<url o texto>" }
    """
    headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
    }

    # Manejo de preflight CORS
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": headers, "body": ""}

    # Parsear body
    try:
        body = json.loads(event.get("body") or "{}")
        user_input = body.get("input", "").strip()
    except json.JSONDecodeError:
        return {
            "statusCode": 400,
            "headers": headers,
            "body": json.dumps({"error": "Body inválido. Se esperaba JSON con campo 'input'."}),
        }

    if not user_input:
        return {
            "statusCode": 400,
            "headers": headers,
            "body": json.dumps({"error": "El campo 'input' no puede estar vacío."}),
        }

    input_type = "url" if _is_url(user_input) else "text"

    # ANÁLISIS SIMULADO 
    # Esta función será reemplazada por llamadas reales a
    # Comprehend, Rekognition y Bedrock en futuras iteraciones.
    result = _mock_analysis(user_input, input_type)

    return {
        "statusCode": 200,
        "headers": headers,
        "body": json.dumps(result, ensure_ascii=False),
    }


def _is_url(text: str) -> bool:
    return bool(re.match(r"^https?://", text, re.IGNORECASE))


def _mock_analysis(user_input: str, input_type: str) -> dict:
    """
    Respuesta simulada que representa la estructura final del API.
    Será reemplazada por análisis real con Comprehend + Rekognition + Bedrock.
    """
    return {
        "score": 62,
        "level": "dudoso",
        "input_type": input_type,
        "explanation": (
            "El contenido presenta algunas señales de alerta: "
            "el lenguaje tiende a ser emotivo y sensacionalista, "
            "no se identifican fuentes verificables citadas explícitamente, "
            "y las afirmaciones principales carecen de evidencia de respaldo. "
            "Se recomienda contrastar con medios verificados antes de compartir."
        ),
        "signals": [
            {
                "id": "sentiment",
                "label": "Tono del lenguaje",
                "detail": "Lenguaje con carga emocional elevada",
                "status": "warning",
            },
            {
                "id": "sources",
                "label": "Fuentes citadas",
                "detail": "No se detectaron fuentes verificables",
                "status": "danger",
            },
            {
                "id": "entities",
                "label": "Entidades identificadas",
                "detail": "Se encontraron personas y organizaciones mencionadas",
                "status": "ok",
            },
            {
                "id": "clickbait",
                "label": "Titular sensacionalista",
                "detail": "Presencia de patrones de clickbait moderada",
                "status": "warning",
            },
        ],
        "disclaimer": (
            "TruthLens estima señales de desinformación mediante IA. "
            "No determina la veracidad absoluta del contenido."
        ),
    }
