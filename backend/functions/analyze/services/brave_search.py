"""
Búsqueda web — Brave Search API.
Busca el titular de la noticia para detectar si otros medios lo reportan
o si contradice lo publicado en fuentes confiables.
"""

import os
import json
import urllib.request
import urllib.parse

_API_KEY  = os.environ.get("BRAVE_API_KEY", "")
_BASE_URL = "https://api.search.brave.com/res/v1/web/search"
_TIMEOUT  = 3   # segundos — si tarda más, continúa sin resultados


def search_headline(text: str) -> list:
    """
    Extrae el titular (primeras 12 palabras) y busca en Brave Search.
    Retorna lista de hasta 5 resultados [{title, url, description}].
    Si falla o no hay API key, retorna lista vacía sin romper el flujo.
    """
    if not _API_KEY:
        print("[brave_search] BRAVE_API_KEY no configurada — omitiendo búsqueda")
        return []

    headline = _extract_headline(text)
    if not headline:
        return []

    try:
        results = _request(headline)
        print(f"[brave_search] '{headline[:50]}...' → {len(results)} resultados")
        return results
    except Exception as e:
        print(f"[brave_search] Error (continúa sin resultados): {e}")
        return []


def _extract_headline(text: str) -> str:
    """Toma las primeras 12 palabras como titular aproximado."""
    words = text.split()
    return " ".join(words[:12]).strip()


def _request(query: str) -> list:
    params = urllib.parse.urlencode({
        "q":     query,
        "count": 5,
        "search_lang": "es",
    })
    url = f"{_BASE_URL}?{params}"

    req = urllib.request.Request(
        url,
        headers={
            "X-Subscription-Token": _API_KEY,
            "Accept":               "application/json",
            "Accept-Language":      "es",
        },
    )

    with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    results = []
    for item in data.get("web", {}).get("results", [])[:5]:
        results.append({
            "title":       item.get("title",       ""),
            "url":         item.get("url",          ""),
            "description": item.get("description", ""),
        })
    return results
