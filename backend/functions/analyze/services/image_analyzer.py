"""
Analizador de imágenes — Amazon Rekognition.
Descarga cada imagen y la manda a Rekognition para detectar
contenido explícito y texto dentro de imágenes.
"""

import re
import urllib.request
import boto3
from botocore.exceptions import BotoCoreError, ClientError

_rekognition = boto3.client("rekognition", region_name="us-east-1")


def extract_image_urls(text: str) -> list:
    patterns = [
        r'https?://[^\s"\'<>]+\.(?:jpg|jpeg|png|gif|webp|bmp)(?:\?[^\s"\'<>]*)?',
        r'src=["\']([^"\']+\.(?:jpg|jpeg|png|gif|webp))["\']',
    ]
    urls = []
    for pattern in patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        urls.extend(matches)
    return list(set(urls))[:5]


def analyze_images(image_urls: list) -> dict:
    if not image_urls:
        return {
            "images_found": 0,
            "results":      [],
            "summary": {
                "has_explicit_content": False,
                "has_text_in_images":   False,
                "overall_risk":         "unknown",
            },
        }

    results = []
    for url in image_urls:
        result = _analyze_single_image(url)
        results.append(result)
        print(f"[image_analyzer] {url[:60]}... → risk={result['overall_risk']}")

    has_explicit = any(r["moderation_labels"] for r in results)
    has_text     = any(r["text_detected"]     for r in results)

    if has_explicit:
        overall_risk = "high"
    elif has_text:
        overall_risk = "medium"
    else:
        overall_risk = "low"

    return {
        "images_found": len(results),
        "results":      results,
        "summary": {
            "has_explicit_content": has_explicit,
            "has_text_in_images":   has_text,
            "overall_risk":         overall_risk,
        },
    }


def _analyze_single_image(url: str) -> dict:
    base = {
        "url":               url,
        "moderation_labels": [],
        "text_detected":     False,
        "overall_risk":      "low",
    }
    try:
        image_bytes = _download_image(url)
        if not image_bytes:
            return base

        image_payload = {"Bytes": image_bytes}

        # Detección de contenido inapropiado
        mod_response = _rekognition.detect_moderation_labels(
            Image=image_payload,
            MinConfidence=70,
        )
        moderation_labels = [
            {"name": l["Name"], "confidence": round(l["Confidence"], 1)}
            for l in mod_response.get("ModerationLabels", [])
        ]

        # Detección de texto dentro de la imagen
        text_response = _rekognition.detect_text(Image=image_payload)
        has_text = len(text_response.get("TextDetections", [])) > 0

        overall_risk = "high" if moderation_labels else ("medium" if has_text else "low")

        return {
            "url":               url,
            "moderation_labels": moderation_labels,
            "text_detected":     has_text,
            "overall_risk":      overall_risk,
        }

    except (BotoCoreError, ClientError) as e:
        print(f"[image_analyzer] Rekognition falló para {url[:60]}: {e}")
        return base
    except Exception as e:
        print(f"[image_analyzer] Error inesperado para {url[:60]}: {e}")
        return base


def _download_image(url: str, max_bytes: int = 5 * 1024 * 1024) -> bytes | None:
    """Descarga la imagen. Rekognition acepta hasta 5MB."""
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; TruthLens/1.0)"},
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            content_type = resp.headers.get("Content-Type", "")
            if "image" not in content_type:
                return None
            return resp.read(max_bytes)
    except Exception:
        return None
