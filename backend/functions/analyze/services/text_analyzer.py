"""
Analizador de texto — Amazon Comprehend.
Usa Comprehend real via boto3. El fallback local se mantiene por si falla la conexión.
"""

import re
import boto3
from botocore.exceptions import BotoCoreError, ClientError

_comprehend = boto3.client("comprehend", region_name="us-east-1")


#  Vocabularios

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
    # Urgencia / impacto
    "impactante", "increíble", "sorprendente", "asombroso", "brutal", "viral",
    "histórico", "exclusivo", "urgente", "último momento", "breaking", "bomba",
    "explosivo", "revolucionario", "insólito", "escandaloso", "polémico",
    "shockante", "inédito", "descubierto", "revelado", "filtrado",
    # Clickbait
    "nunca visto", "lo que nadie", "te sorprenderá", "no lo creerás",
    "te dejará sin palabras", "lo que no te cuentan", "la verdad oculta",
    # Conspirativo-sensacionalista
    "silenciado", "prohibido", "censurado", "ocultaron", "escondieron",
    "taparon", "encubrieron",
}

# Patrones de lenguaje conspirativo — frases completas
CONSPIRACY_PATTERNS = [
    r"lo que (no |nunca |jamás )?(te |nos )?(quieren|quiere|quería|querían) que (sepas|sepa|veas|vea|escuches|escuche)",
    r"(antes de que|antes que) (lo )?(borren|eliminen|censuren|quiten|bajen|borren esto)",
    r"(el|la|los|las) (gobierno|estado|sistema|élite|élites|establishment|corporaciones?).{0,30}(oculta|esconde|calla|silencia|lleva años?|llevan años?)",
    r"(te|nos|les) (están|estaban|han estado) (mintiendo|ocultando|engañando|manipulando)",
    r"(la verdad que|verdad que) (nadie|no|nunca) (dice|cuenta|muestra|publica|quieren que sepas)",
    r"(comparte|difunde|reenvía|manda|pasa) (esto )?(antes de que|antes que|por si)",
    r"(medios?|prensa).{0,20}(mainstream|oficiales?|corporativos?|vendida|pagada|corrupta)",
    r"(plan|agenda).{0,15}(oculto|secreta?|globalista|mundial|élite)",
    r"(nuevo orden mundial|gran reset|reset mundial|depopulación)",
    r"(deep state|estado profundo|gobierno en la sombra)",
    r"(plandemia|scamdemia|casedemia|planazo)",
    r"(químtrails?|chemtrails?)",
    r"(5g|5-g).{0,30}(virus|enfermed|cáncer|radiaci|control)",
    r"(microchips?|chips?).{0,30}(vacuna|inyección|sangre)",
    r"(ellos|los de arriba|los poderosos).{0,30}(controlan|manejan|deciden|ocultan)",
    r"(saben (pero )?no (lo )?dicen|lo saben y callan)",
    r"acuerdo (secreto|oculto).{0,30}(empresa|corporaci|gobierno|farmacéu)",
    r"(llevan años?|hace años que).{0,30}(ocultando|escondiendo|callando|mintiendo)",
]

# Patrones de fuentes anónimas — cuentan en contra, no a favor
ANONYMOUS_SOURCE_PATTERNS = [
    r"(fuentes?|científicos?|expertos?|investigadores?|médicos?|especialistas?|funcionarios?).{0,20}(secretos?|anónimos?|cercanos?|sin nombre|que (pidieron?|solicitaron?) anonimato|que (prefirieron?|prefiere) no ser identificad)",
    r"según (fuentes?|científicos?|expertos?|personas?).{0,20}(secretas?|anónimas?|cercanas?|confiables? pero anónimas?)",
    r"(alguien|una persona|un testigo|una fuente|un insider|un filtrador).{0,30}(reveló|confirmó|dijo|afirmó|aseguró|alertó)",
    r"(un|una) (médico|científico|funcionario|empleado|investigador|experto).{0,30}(que (pidió|prefirió) (el )?anonimato|anónimo|sin identificar)",
    r"testigos? (presenciales? )?(que |quienes )?(prefirieron?|pidieron?).{0,20}anonimato",
    r"fuentes? (del gobierno|gubernamentales?|oficiales?|de alto nivel).{0,20}(que|quienes).{0,20}(anonimato|no identificar|nombre)",
]

# Patrones de fuentes verificables (nombradas)
SOURCE_PATTERNS = [
    r"según\s+(?!fuentes?\s+(?:secretas?|anónimas?))\w+",
    r"de acuerdo (con|a)\s+\w+",
    r"informó\s+\w+",
    r"declaró\s+\w+",
    r"publicó\s+\w+",
    r"afirmó\s+(?:el|la|los|las)?\s*\w+",
    r"señaló\s+(?:el|la|los|las)?\s*\w+",
    r"fuente[s]?:\s*\w+",
    r"https?://[^\s]+",
    r"www\.[^\s]+",
    r"\(\w+,\s*20\d{2}\)",
    r"el (diario|periódico|portal|medio)\s+\w+",
    r"(Reuters|AFP|AP|EFE|BBC|CNN|OMS|OPS|ONU|OEA|WHO|CDC)\b",
]


#  Comprehend real

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
    except (BotoCoreError, ClientError):
        return _fallback_sentiment(text)


def detect_entities(text: str) -> list:
    try:
        response = _comprehend.detect_entities(
            Text=text[:4900],
            LanguageCode="es"
        )
        return [
            {"Text": e["Text"], "Type": e["Type"], "Score": round(e["Score"], 3)}
            for e in response["Entities"]
        ]
    except (BotoCoreError, ClientError):
        return _fallback_entities(text)


def detect_sources(text: str) -> dict:
    """Detecta fuentes nombradas (positivo) y fuentes anónimas (negativo) por separado."""
    text_lower = text.lower()

    # Fuentes verificables nombradas
    named_matches = []
    for pattern in SOURCE_PATTERNS:
        matches = re.findall(pattern, text, re.IGNORECASE)
        named_matches.extend(matches)

    # Fuentes anónimas (se descuentan de las nombradas y suman como red flag)
    anon_matches = []
    for pattern in ANONYMOUS_SOURCE_PATTERNS:
        matches = re.findall(pattern, text_lower, re.IGNORECASE)
        anon_matches.extend(matches)

    named_count = len(named_matches)
    anon_count  = len(anon_matches)

    # Fuentes netas verificables (descontando las anónimas que solapan)
    net_named = max(0, named_count - anon_count)

    return {
        "count":                net_named,
        "raw_count":            named_count,
        "anonymous_count":      anon_count,
        "has_anonymous_sources": anon_count > 0,
        "found":                named_matches[:5],
    }


def detect_sensationalism(text: str) -> dict:
    text_lower   = text.lower()
    hits         = [w for w in SENSATIONALIST_WORDS if w in text_lower]
    words        = text.split()
    caps_words   = [w for w in words if len(w) > 3 and w.isupper()]
    caps_ratio   = len(caps_words) / max(len(words), 1)
    # Contamos ! individuales (el español usa ¡...! — cada oración cuenta doble)
    exclamations = text.count("!")
    is_sensationalist = len(hits) >= 2 or caps_ratio > 0.15 or exclamations >= 3
    return {
        "sensationalist_words": hits,
        "caps_ratio":           round(caps_ratio, 3),
        "exclamations":         exclamations,
        "is_sensationalist":    is_sensationalist,
    }


def detect_conspiracy(text: str) -> dict:
    """Detecta lenguaje conspirativo: patrones que indican desinformación intencional."""
    text_lower = text.lower()
    matched_patterns = []
    for pattern in CONSPIRACY_PATTERNS:
        matches = re.findall(pattern, text_lower, re.IGNORECASE)
        if matches:
            # Guardamos el primer match de cada patrón como ejemplo
            example = matches[0] if isinstance(matches[0], str) else " ".join(matches[0])
            matched_patterns.append(example[:80])

    return {
        "is_conspiracy":   len(matched_patterns) >= 1,
        "pattern_count":   len(matched_patterns),
        "examples":        matched_patterns[:3],
    }


def analyze_text(text: str) -> dict:
    return {
        "sentiment":      analyze_sentiment(text),
        "entities":       detect_entities(text),
        "sources":        detect_sources(text),
        "sensationalism": detect_sensationalism(text),
        "conspiracy":     detect_conspiracy(text),
        "word_count":     len(text.split()),
        "char_count":     len(text),
    }


#  Fallbacks locales 

def _fallback_sentiment(text: str) -> dict:
    words     = set(re.findall(r"\b\w+\b", text.lower()))
    neg_hits  = len(words & NEGATIVE_WORDS)
    pos_hits  = len(words & POSITIVE_WORDS)
    total     = max(neg_hits + pos_hits, 1)
    neg_score = round(neg_hits / total, 3)
    pos_score = round(pos_hits / total, 3)
    neu_score = round(max(0, 1 - neg_score - pos_score), 3)

    if neg_score > 0.5:                                    sentiment = "NEGATIVE"
    elif pos_score > 0.5:                                  sentiment = "POSITIVE"
    elif neg_score > 0.2 and pos_score > 0.2:              sentiment = "MIXED"
    else:                                                  sentiment = "NEUTRAL"

    return {
        "Sentiment": sentiment,
        "SentimentScore": {
            "Positive": pos_score, "Negative": neg_score,
            "Neutral":  neu_score, "Mixed": round(max(0, 1 - pos_score - neg_score - neu_score), 3),
        },
    }


def _fallback_entities(text: str) -> list:
    ENTITY_PATTERNS = {
        "ORGANIZATION": [
            r"\b(ONU|OMS|OEA|FMI|OTAN|UNESCO|UNICEF|FBI|CIA|NASA|WHO|CDC|AFP|Reuters)\b",
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
    entities, seen = [], set()
    for entity_type, patterns in ENTITY_PATTERNS.items():
        for pattern in patterns:
            for match in re.finditer(pattern, text):
                t = match.group().strip()
                if t not in seen:
                    seen.add(t)
                    entities.append({"Text": t, "Type": entity_type, "Score": 0.92})
    return entities
