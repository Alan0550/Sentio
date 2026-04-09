"""
Analizador de imágenes — mock de Amazon Rekognition.
Devuelve la misma estructura que Rekognition real.
Cuando se conecte AWS, este módulo se reemplaza por llamadas boto3.
"""

import re


def extract_image_urls(text: str) -> list:
    """Extrae URLs de imágenes del texto o HTML."""
    patterns = [
        r'https?://[^\s"\'<>]+\.(?:jpg|jpeg|png|gif|webp|bmp)(?:\?[^\s"\'<>]*)?',
        r'src=["\']([^"\']+\.(?:jpg|jpeg|png|gif|webp))["\']',
    ]
    urls = []
    for pattern in patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        urls.extend(matches)

    return list(set(urls))[:5]  # máximo 5 imágenes


def analyze_images(image_urls: list) -> dict:
    """
    Simula análisis de imágenes.
    En producción: llama a Rekognition por cada URL.
    """
    if not image_urls:
        return {
            "images_found": 0,
            "results": [],
            "summary": {
                "has_explicit_content": False,
                "has_text_in_images":   False,
                "overall_risk":         "unknown",
            },
        }

    # Mock: simulamos que las imágenes son normales
    # En producción, Rekognition analizaría cada una
    results = []
    for url in image_urls:
        results.append({
            "url": url,
            "moderation_labels": [],        # Rekognition: contenido explícito
            "text_detected":     False,     # Rekognition: texto dentro de imagen
            "celebrities":       [],        # Rekognition: celebridades detectadas
            "confidence":        0.95,
        })

    return {
        "images_found": len(image_urls),
        "results":      results,
        "summary": {
            "has_explicit_content": False,
            "has_text_in_images":   False,
            "overall_risk":         "low",
        },
    }
