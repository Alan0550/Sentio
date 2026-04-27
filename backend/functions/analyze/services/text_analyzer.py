"""
Analizador de texto — Amazon Comprehend.
Sentio: análisis de sentimiento y entidades para feedback empresarial.
"""

import re
import boto3
from botocore.exceptions import BotoCoreError, ClientError

_comprehend = boto3.client("comprehend", region_name="us-east-1")


# ── Vocabularios para fallback ────────────────────────────────────────────────

NEGATIVE_WORDS = {
    # Experiencia negativa general
    "malo", "pésimo", "terrible", "horrible", "fatal", "decepcionante",
    "deficiente", "inaceptable", "vergonzoso", "desastroso", "mediocre",
    # Atención
    "grosero", "maleducado", "indiferente", "incompetente", "inútil",
    "tardaron", "tardó", "espera", "demora", "ignoraron", "ignoró",
    # Producto/servicio
    "roto", "dañado", "defectuoso", "incompleto", "equivocado", "falló",
    "falla", "error", "problema", "problemas", "queja",
    # Churn signals
    "cancelar", "cancelaré", "me voy", "cambiaré", "nunca más", "última vez",
    "no vuelvo", "no recomiendo", "desaconsejo", "arrepentido",
    # Frustración
    "frustrado", "frustración", "molesto", "enojado", "indignado", "hartó",
    "harto", "cansado", "decepcionado", "decepción",
}

POSITIVE_WORDS = {
    # Experiencia positiva general
    "excelente", "increíble", "fantástico", "maravilloso", "perfecto",
    "espectacular", "genial", "buenísimo", "satisfecho", "contento",
    # Atención
    "amable", "atento", "profesional", "eficiente", "rápido", "cordial",
    "servicial", "resolvieron", "resolvió", "ayudaron", "ayudó",
    # Producto/servicio
    "funciona", "calidad", "confiable", "seguro", "cómodo", "práctico",
    # Lealtad
    "recomiendo", "recomendaría", "volvería", "siempre vuelvo", "fiel",
    "leal", "favorito", "mejor", "lo mejor",
}

CHURN_SIGNALS = {
    "cancelar", "cancelaré", "voy a cancelar", "quiero cancelar",
    "me cambio", "cambiaré de", "cambio de proveedor", "busco otra",
    "buscaré otra", "nunca más", "no vuelvo", "última vez",
    "me voy", "adiós", "hasta nunca", "competencia", "otro proveedor",
    "mejor en otro lado", "no lo recomiendo", "desaconsejo",
}

URGENCY_SIGNALS = {
    "denunciar", "denuncia", "demanda", "demandaré", "abogado", "legal",
    "consumidor", "reclamo formal", "urgente", "emergencia", "peligro",
    "accidente", "daño físico", "lesión", "inmediato", "ahora mismo",
}


# ── Comprehend ────────────────────────────────────────────────────────────────

def analyze_sentiment(text: str) -> dict:
    try:
        response = _comprehend.detect_sentiment(
            Text=text[:4900],
            LanguageCode="es"
        )
        return {
            "Sentiment":      response["Sentiment"],
            "SentimentScore": response["SentimentScore"],
        }
    except (BotoCoreError, ClientError) as e:
        print(f"[text_analyzer] Comprehend sentiment falló: {e}")
        return _fallback_sentiment(text)


def detect_entities(text: str) -> list:
    try:
        response = _comprehend.detect_entities(
            Text=text[:4900],
            LanguageCode="es"
        )
        return [
            {
                "Text":  e["Text"],
                "Type":  e["Type"],
                "Score": round(e["Score"], 3)
            }
            for e in response["Entities"]
            if e["Score"] > 0.7  # solo entidades con alta confianza
        ]
    except (BotoCoreError, ClientError) as e:
        print(f"[text_analyzer] Comprehend entities falló: {e}")
        return _fallback_entities(text)


def detect_churn_signals(text: str) -> dict:
    """
    Detecta señales de churn en el texto.
    Útil como contexto adicional para Bedrock.
    """
    text_lower = text.lower()
    found = [w for w in CHURN_SIGNALS if w in text_lower]
    return {
        "has_churn_signals": len(found) > 0,
        "churn_words_found": found[:5],
        "churn_count":       len(found),
    }


def detect_urgency_signals(text: str) -> dict:
    """
    Detecta si el feedback requiere atención urgente.
    """
    text_lower = text.lower()
    found = [w for w in URGENCY_SIGNALS if w in text_lower]
    return {
        "has_urgency": len(found) > 0,
        "urgency_words_found": found[:3],
    }


def get_basic_stats(text: str) -> dict:
    """
    Estadísticas básicas del texto.
    """
    words      = text.split()
    sentences  = re.split(r'[.!?]+', text)
    sentences  = [s.strip() for s in sentences if s.strip()]

    return {
        "word_count":     len(words),
        "char_count":     len(text),
        "sentence_count": len(sentences),
        "avg_words_per_sentence": round(
            len(words) / max(len(sentences), 1), 1
        ),
    }


def analyze_text(text: str) -> dict:
    """
    Punto de entrada principal.
    Devuelve todo lo que necesita score_engine.py para analizar el feedback.
    """
    return {
        "sentiment":       analyze_sentiment(text),
        "entities":        detect_entities(text),
        "churn_signals":   detect_churn_signals(text),
        "urgency_signals": detect_urgency_signals(text),
        "stats":           get_basic_stats(text),
    }


# ── Fallbacks locales ─────────────────────────────────────────────────────────

def _fallback_sentiment(text: str) -> dict:
    words    = set(re.findall(r"\b\w+\b", text.lower()))
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
            "Mixed":    round(max(0, 1 - pos_score - neg_score - neu_score), 3),
        },
    }


def _fallback_entities(text: str) -> list:
    """
    Detecta entidades básicas cuando Comprehend no responde.
    Útil para identificar marcas, productos y personas mencionadas.
    """
    ENTITY_PATTERNS = {
        "ORGANIZATION": [
            r"\b(Tigo|Entel|Viva|Claro|Movistar|WOM)\b",
            r"\b(Ministerio|Secretaría|Banco|Empresa|Tienda)\s+\w+",
            r"\b(Amazon|Netflix|Uber|Rappi|PedidosYa)\b",
        ],
        "PERSON": [
            r"\b(Sr|Sra|Dr|Dra|Lic)\.\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+",
        ],
        "LOCATION": [
            r"\b(Santa Cruz|La Paz|Cochabamba|Sucre|Oruro|Potosí|Tarija|Trinidad|Cobija)\b",
            r"\b(Bolivia|Argentina|Brasil|Chile|Perú|Colombia)\b",
        ],
        "PRODUCT": [
            r"\b(plan|producto|servicio|paquete|equipo|dispositivo)\s+\w+",
        ],
    }

    entities, seen = [], set()
    for entity_type, patterns in ENTITY_PATTERNS.items():
        for pattern in patterns:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                t = match.group().strip()
                if t not in seen:
                    seen.add(t)
                    entities.append({
                        "Text":  t,
                        "Type":  entity_type,
                        "Score": 0.85
                    })
    return entities