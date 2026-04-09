"""
Analizador de texto — mock de Amazon Comprehend.
Devuelve la misma estructura que Comprehend real.
Cuando se conecte AWS, este módulo se reemplaza por llamadas boto3.
"""

import re


# ── Listas de palabras ────────────────────────────────────────────────────────

NEGATIVE_WORDS = {
    "falso", "mentira", "engaño", "fraude", "estafa", "corrupto", "corrupción",
    "ilegal", "criminal", "delito", "peligroso", "peligro", "alarmante", "crisis",
    "escándalo", "vergonzoso", "terrible", "horrible", "desastre", "catástrofe",
    "trampa", "manipulado", "manipulación", "censurado", "oculto", "secreto",
    "conspira", "conspiración", "encubrimiento", "amenaza", "ataque", "víctima",
    "caos", "colapso", "fracaso", "muerte", "muertos", "asesinato", "crimen",
    "robo", "violencia", "guerra", "conflicto", "destrucción", "explosión",
}

POSITIVE_WORDS = {
    "confirmado", "verificado", "oficial", "comprobado", "científico", "estudio",
    "investigación", "según", "fuente", "datos", "estadísticas", "informe",
    "reporte", "análisis", "experto", "especialista", "autoridad", "gobierno",
    "institución", "universidad", "hospital", "organización", "asociación",
    "publicó", "declaró", "informó", "afirmó", "señaló", "indicó",
}

SENSATIONALIST_WORDS = {
    "impactante", "increíble", "sorprendente", "asombroso", "brutal", "viral",
    "histórico", "nunca visto", "lo que nadie", "te sorprenderá", "no lo creerás",
    "exclusivo", "urgente", "último momento", "breaking", "bomba", "explosivo",
    "revolucionario", "insólito", "escandaloso", "polémico", "controversial",
    "shockante", "inédito", "descubierto", "revelado", "filtrado",
}

SOURCE_PATTERNS = [
    r"según\s+\w+",
    r"de acuerdo (con|a)\s+\w+",
    r"informó\s+\w+",
    r"declaró\s+\w+",
    r"publicó\s+\w+",
    r"fuente[s]?[:]\s*\w+",
    r"https?://[^\s]+",
    r"www\.[^\s]+",
    r"\(\w+,\s*20\d{2}\)",          # cita tipo (Autor, 2023)
    r"el (diario|periódico|portal)\s+\w+",
]

ENTITY_PATTERNS = {
    "ORGANIZATION": [
        r"\b(ONU|OMS|OEA|FMI|OTAN|UNESCO|UNICEF|FBI|CIA|NASA)\b",
        r"\b(Ministerio|Secretaría|Congreso|Senado|Corte|Tribunal)\s+\w+",
        r"\b(Universidad|Instituto|Hospital|Banco|Empresa|Corporación)\s+\w+",
    ],
    "PERSON": [
        r"\b(Dr|Dra|Ing|Lic|Prof|Sr|Sra)\.\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+",
        r"\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\b",
    ],
    "LOCATION": [
        r"\b(Ciudad de México|Buenos Aires|Bogotá|Lima|Santiago|Madrid|Washington)\b",
        r"\b(México|Argentina|Colombia|Perú|Chile|España|Estados Unidos|Brasil)\b",
    ],
}


# ── Funciones de análisis ─────────────────────────────────────────────────────

def analyze_sentiment(text: str) -> dict:
    """Detecta el sentimiento del texto. Misma estructura que Comprehend."""
    words = set(re.findall(r"\b\w+\b", text.lower()))

    neg_hits = len(words & NEGATIVE_WORDS)
    pos_hits = len(words & POSITIVE_WORDS)
    total    = max(neg_hits + pos_hits, 1)

    neg_score = round(neg_hits / total, 3)
    pos_score = round(pos_hits / total, 3)
    neu_score = round(max(0, 1 - neg_score - pos_score), 3)

    if neg_score > 0.5:
        sentiment = "NEGATIVE"
    elif pos_score > 0.5:
        sentiment = "POSITIVE"
    elif neg_score > 0.2 and pos_score > 0.2:
        sentiment = "MIXED"
    else:
        sentiment = "NEUTRAL"

    return {
        "Sentiment": sentiment,
        "SentimentScore": {
            "Positive": pos_score,
            "Negative": neg_score,
            "Neutral":  neu_score,
            "Mixed":    round(1 - pos_score - neg_score - neu_score, 3),
        },
    }


def detect_entities(text: str) -> list:
    """Detecta entidades nombradas. Misma estructura que Comprehend."""
    entities = []
    seen = set()

    for entity_type, patterns in ENTITY_PATTERNS.items():
        for pattern in patterns:
            for match in re.finditer(pattern, text):
                entity_text = match.group().strip()
                if entity_text not in seen:
                    seen.add(entity_text)
                    entities.append({
                        "Text":  entity_text,
                        "Type":  entity_type,
                        "Score": 0.92,
                    })

    return entities


def detect_sources(text: str) -> dict:
    """Detecta si el texto cita fuentes verificables."""
    found = []
    for pattern in SOURCE_PATTERNS:
        matches = re.findall(pattern, text, re.IGNORECASE)
        found.extend(matches)

    return {
        "count": len(found),
        "found": found[:5],  # máximo 5 ejemplos
    }


def detect_sensationalism(text: str) -> dict:
    """Detecta lenguaje sensacionalista y clickbait."""
    text_lower = text.lower()
    hits = []

    for word in SENSATIONALIST_WORDS:
        if word in text_lower:
            hits.append(word)

    # Detectar uso excesivo de mayúsculas
    words        = text.split()
    caps_words   = [w for w in words if len(w) > 3 and w.isupper()]
    caps_ratio   = len(caps_words) / max(len(words), 1)

    # Detectar signos de exclamación múltiples
    exclamations = len(re.findall(r"!{2,}", text))

    return {
        "sensationalist_words": hits,
        "caps_ratio":           round(caps_ratio, 3),
        "exclamations":         exclamations,
        "is_sensationalist":    len(hits) >= 2 or caps_ratio > 0.2 or exclamations >= 2,
    }


def analyze_text(text: str) -> dict:
    """
    Análisis completo del texto.
    Punto de entrada principal del módulo.
    """
    return {
        "sentiment":      analyze_sentiment(text),
        "entities":       detect_entities(text),
        "sources":        detect_sources(text),
        "sensationalism": detect_sensationalism(text),
        "word_count":     len(text.split()),
        "char_count":     len(text),
    }
