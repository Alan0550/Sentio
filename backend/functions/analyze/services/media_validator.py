"""
Validador de medios de comunicación.
Verifica si la URL de origen es un medio confiable y si el texto
menciona medios conocidos de forma legítima o sospechosa.
"""

import re
from urllib.parse import urlparse

TRUSTED_MEDIA = {
    # Bolivia
    "eldeber.com.bo", "larazon.bo", "opinion.com.bo", "lostiempos.com",
    "erbol.com.bo", "abi.bo", "reduno.com.bo", "unitel.bo", "eldia.com.bo",
    "paginasiete.bo", "correodelsur.com", "eju.tv", "noticiasfides.com",
    # Latinoamérica
    "infobae.com", "semana.com", "clarin.com", "lanacion.com.ar",
    "eltiempo.com", "eluniversal.com.mx", "emol.com", "latercera.com",
    "elpais.com.uy", "elpais.com", "expansion.com",
    # Internacionales
    "cnn.com", "bbc.com", "bbc.co.uk", "nytimes.com", "reuters.com",
    "apnews.com", "france24.com", "dw.com", "theguardian.com",
    "washingtonpost.com", "afp.com", "bloomberg.com",
    # Fact-checkers
    "snopes.com", "factcheck.org", "politifact.com", "chequeado.com",
    "maldita.es", "colombiacheck.com", "elobservador.com.uy",
}

# Nombres de display → dominio (para búsqueda en texto)
_MEDIA_NAMES = {
    # Bolivia
    "El Deber":       "eldeber.com.bo",
    "La Razón":       "larazon.bo",
    "Opinión":        "opinion.com.bo",
    "Los Tiempos":    "lostiempos.com",
    "Erbol":          "erbol.com.bo",
    "ABI":            "abi.bo",
    "Red Uno":        "reduno.com.bo",
    "Unitel":         "unitel.bo",
    "El Día":         "eldia.com.bo",
    "Página Siete":   "paginasiete.bo",
    "Correo del Sur": "correodelsur.com",
    "EJU":            "eju.tv",
    "Fides":          "noticiasfides.com",
    # Internacionales
    "CNN":            "cnn.com",
    "BBC":            "bbc.com",
    "Reuters":        "reuters.com",
    "AP":             "apnews.com",
    "AFP":            "afp.com",
    "France 24":      "france24.com",
    "DW":             "dw.com",
    "El País":        "elpais.com",
    "Infobae":        "infobae.com",
    "Semana":         "semana.com",
    "Clarín":         "clarin.com",
    "Bloomberg":      "bloomberg.com",
    "The Guardian":   "theguardian.com",
    "New York Times": "nytimes.com",
}

# Patrones donde se menciona un medio serio de forma sospechosa
# (ej: "Reuters confirmó la conspiración", "BBC reveló el secreto que ocultan")
_SUSPICIOUS_PATTERNS = [
    r"(reuters|bbc|cnn|ap\b|afp|nytimes|el país|infobae|bloomberg|guardian).{0,40}"
    r"(reveló|confirmó|destapó|filtró|admitió|confesó).{0,60}"
    r"(secreto|conspiración|oculto|encubierto|verdad que|escándalo que nadie)",

    r"(reuters|bbc|cnn|ap\b|afp|nytimes|el país|infobae|bloomberg|guardian).{0,40}"
    r"(tuvo que reconocer|se vio obligado|no pudo negar|finalmente admitió)",

    r"hasta (reuters|bbc|cnn|ap\b|afp|el país).{0,30}(confirmó|reconoció|admitió)",
]


def validate_url(article_url: str) -> dict:
    """
    Verifica si la URL del artículo pertenece a un medio confiable.
    Retorna dict con checked, trusted y domain.
    """
    if not article_url:
        return {"checked": False, "trusted": False, "domain": None}

    try:
        domain = urlparse(article_url).netloc.lower().removeprefix("www.")
        # Coincidencia exacta o subdominio (ej: "espanol.reuters.com")
        trusted = (
            domain in TRUSTED_MEDIA
            or any(domain.endswith("." + m) for m in TRUSTED_MEDIA)
        )
        return {"checked": True, "trusted": trusted, "domain": domain}
    except Exception:
        return {"checked": False, "trusted": False, "domain": None}


def validate_mentions(text: str) -> dict:
    """
    Busca menciones de medios confiables en el texto.
    Distingue menciones legítimas de menciones sospechosas.
    Un texto puede falsamente invocar un medio serio — no suma puntos
    definitivos, solo contexto para Haiku.
    """
    text_lower = text.lower()

    mentioned = [
        name for name in _MEDIA_NAMES
        if name.lower() in text_lower
    ]

    suspicious = any(
        re.search(p, text_lower, re.IGNORECASE)
        for p in _SUSPICIOUS_PATTERNS
    )

    return {
        "mentioned_media":    mentioned,
        "has_trusted_mention": len(mentioned) > 0,
        "suspicious_mention":  suspicious,
    }
