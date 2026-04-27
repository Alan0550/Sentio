"""
Motor de análisis — Amazon Bedrock (Claude Haiku).
Sentio: análisis de feedback empresarial con NPS inferido,
aspectos por sentimiento y riesgo de churn.
"""

import os
import json
import re
import time
import boto3
from botocore.config import Config

_bedrock = boto3.client(
    "bedrock-runtime",
    region_name="us-east-1",
    config=Config(
        read_timeout=25,
        connect_timeout=5,
        retries={"max_attempts": 1},
    ),
)

MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0")

# ── Aspectos por industria ────────────────────────────────────────────────────

ASPECTS_TELCO = [
    # Calidad del servicio de red — aspectos diferenciados
    "velocidad de internet",
    "estabilidad de la conexión",
    "cobertura de red",
    # Servicio al cliente
    "atención al cliente",
    "tiempo de espera en soporte",
    # Facturación y precios
    "precio del plan",
    "facturación",
    # Servicio técnico
    "instalación",
    "soporte técnico",
    # Producto digital y cancelación
    "app móvil",
    "cortes de servicio",
    "proceso de cancelación",
]

ASPECTS_RETAIL = [
    # Experiencia de compra
    "precio",
    "variedad de productos",
    "proceso de pago",
    # Entrega y logística
    "tiempo de entrega",
    "estado del empaque",
    # Producto
    "calidad del producto",
    "descripción del producto",
    # Postventa
    "proceso de devolución",
    "proceso de reembolso",
    "servicio postventa",
    # Canal digital
    "app o sitio web",
    "atención al cliente",
]

ASPECTS_GENERAL = [
    "precio",
    "calidad",
    "atención al cliente",
    "tiempo de espera",
    "proceso",
    "comunicación",
    "producto o servicio",
    "experiencia general",
]


def detect_industry(text: str) -> tuple:
    text_lower = text.lower()

    telco_kw = {
        "internet", "señal", "cobertura", "megas", "fibra", "router",
        "plan", "datos", "llamadas", "factura", "corte", "técnico",
        "instalación", "tigo", "entel", "viva", "claro"
    }
    retail_kw = {
        "producto", "entrega", "paquete", "envío", "tienda", "compra",
        "devolución", "cambio", "reembolso", "stock", "pedido", "precio",
        "empaque", "compré", "compro", "pedí", "llegó", "llegaron",
        "despacho", "despachan", "enví", "carrito", "checkout",
    }

    telco_hits  = sum(1 for kw in telco_kw  if kw in text_lower)
    retail_hits = sum(1 for kw in retail_kw if kw in text_lower)

    if telco_hits >= 2 and telco_hits >= retail_hits:
        return "telco", ASPECTS_TELCO
    if retail_hits >= 2 and retail_hits > telco_hits:
        return "retail", ASPECTS_RETAIL
    return "general", ASPECTS_GENERAL


# ── Análisis principal ────────────────────────────────────────────────────────

def analyze_feedback(text: str, comprehend_result: dict) -> dict:
    """
    Punto de entrada principal.
    Recibe el texto del feedback y el resultado de Comprehend.
    Devuelve el análisis completo de Sentio.
    """
    industry, aspects = detect_industry(text)
    sentiment = comprehend_result.get("sentiment", {})
    entities  = comprehend_result.get("entities", [])

    result = _call_bedrock(text, sentiment, entities, aspects, industry)
    return result


# ── Bedrock ───────────────────────────────────────────────────────────────────

def _call_bedrock(text: str, sentiment: dict,
                  entities: list, aspects: list, industry: str) -> dict:
    t0 = time.time()
    print(f"[sentio] Llamando a Bedrock — industry={industry}")
    try:
        result  = _bedrock_request(text, sentiment, entities, aspects, industry)
        elapsed = round(time.time() - t0, 2)
        print(f"[sentio] Bedrock OK — {elapsed}s")
        return result
    except Exception as e:
        elapsed = round(time.time() - t0, 2)
        print(f"[sentio] Bedrock FALLÓ ({elapsed}s): {e}")
        return _fallback(text, sentiment)


def _bedrock_request(text: str, sentiment: dict,
                     entities: list, aspects: list, industry: str) -> dict:

    sentiment_label = sentiment.get("Sentiment", "NEUTRAL")
    scores          = sentiment.get("SentimentScore", {})
    neg_score       = round(scores.get("Negative", 0) * 100)
    pos_score       = round(scores.get("Positive", 0) * 100)
    neu_score       = round(scores.get("Neutral",  0) * 100)
    mix_score       = round(scores.get("Mixed",    0) * 100)

    entity_names = [e.get("Text", "") for e in entities[:10]]
    entity_str   = ", ".join(entity_names) if entity_names else "ninguna detectada"

    aspects_str  = "\n".join(f"- {a}" for a in aspects)
    truncated    = " ".join(text.split()[:800])

    prompt = f"""Eres un experto en análisis de experiencia de cliente (CX) y voz del cliente (VoC) para empresas de retail, telco y banca en Latinoamérica.
Analiza el siguiente feedback de un cliente y devuelve información estructurada con máxima precisión.

INDUSTRIA DETECTADA: {industry}

FEEDBACK DEL CLIENTE:
{truncated}

DATOS DE COMPREHEND (contexto adicional, úsalos como referencia):
- Sentimiento general: {sentiment_label}
- Negativo: {neg_score}% | Positivo: {pos_score}% | Neutro: {neu_score}% | Mixto: {mix_score}%
- Entidades detectadas: {entity_str}

ASPECTOS A EVALUAR para industria {industry} (solo incluí los que aparecen explícitamente en el texto):
{aspects_str}

═══════════════════════════════════════════════════════════
REGLA CRÍTICA — SARCASMO E IRONÍA:
Si el cliente usa sarcasmo o ironía (ej: "qué EXCELENTE servicio" en contexto claramente negativo,
o "normal, como siempre" con tono de resignación), clasificá el sentimiento según la INTENCIÓN REAL,
no las palabras literales. El contexto y el tono son lo que importa.
═══════════════════════════════════════════════════════════

CRITERIOS NPS — PRECISIÓN OBLIGATORIA:
- Promotor (score 9-10): lenguaje entusiasta, recomienda explícitamente, expresa lealtad fuerte.
  Señales: "lo recomiendo", "increíble", "siempre vuelvo", "lo mejor que me pasó", "fue un 10".
- Promotor (score 8): muy satisfecho pero sin entusiasmo máximo. Lenguaje positivo moderado.
- Pasivo (score 7): satisfecho en general, menciona al menos un aspecto positivo pero también uno negativo.
  Señales: "está bien pero...", "en general bien", "podría mejorar en...".
- Pasivo (score 6): más neutral, algunos problemas, no amenaza con irse aún.
- Detractor (score 4-5): frustración clara con uno o varios aspectos específicos. No amenaza aún.
- Detractor (score 2-3): frustración fuerte, múltiples quejas, lenguaje de advertencia.
- Detractor (score 1): lenguaje extremo, cancela o ya se fue, amenaza legal, daño físico.

CRITERIOS CHURN:
- Alto: menciona explícitamente cancelar, "nunca más", "me voy a la competencia", "cancelé el contrato".
- Medio: frustración repetida con múltiples problemas, lenguaje de advertencia ("si sigue así me voy"),
  o compara con competencia sin decisión tomada.
- Bajo: quejas puntuales o aisladas sin señales de abandono. Un solo problema menor.

CRITERIOS URGENCIA — SER CONSERVADOR (urgency=true solo en casos reales):
urgency=TRUE si y solo si hay al menos UNO de estos indicadores:
  a) Riesgo físico o de seguridad ("me lastimé", "me cortó", "explosión", "peligroso").
  b) Amenaza legal explícita ("denuncia", "abogado", "Ministerio", "ASFI", "demanda").
  c) Amenaza de cancelación INMEDIATA ("cancelo esta semana", "llamo mañana a cancelar", "ya cancelé").
  d) Exposición en medios o redes ("voy a publicar en redes", "periodista", "noticia").
  e) Fraude o cobro no autorizado ("me robaron", "cargo no autorizado").

urgency=FALSE cuando:
  - El cliente expresa que "evaluará opciones" o "pensará en cambiar" → es churn_risk=medio, NO urgencia.
  - La frustración es alta pero no hay acción inmediata anunciada.
  - El cliente pide una mejora general sin amenazar con acción concreta.

CRITERIOS CONFIANZA EN ASPECTOS:
- confidence 0.9-1.0: hay frase explícita y directa en el texto que menciona este aspecto.
- confidence 0.7-0.89: el aspecto se infiere claramente del contexto aunque no se nombre directamente.
- confidence 0.5-0.69: inferencia débil, el aspecto podría interpretarse de otra forma.
- NO incluir aspectos con confidence < 0.5. Si hay duda, no lo incluyas.

ACCIÓN RECOMENDADA — SER ESPECÍFICO Y ACCIONABLE:
No usar frases genéricas como "contactar al cliente". En cambio:
- Si hay riesgo de cancelación inmediata: "Llamar al cliente en menos de 2 horas — menciona cancelación esta semana"
- Si hay problema técnico sin resolver: "Escalar a soporte de nivel 2 con prioridad — cliente lleva N días sin servicio"
- Si el cliente es promotor: "Invitar al programa de referidos — score 9+, cliente recurrente"
- Si hay señal legal: "Notificar al equipo legal y al gerente de atención — mención de denuncia formal"
- Si el cliente evalúa opciones: "Enviar oferta de retención en las próximas 48 horas"

Responde ÚNICAMENTE con este JSON exacto (sin texto antes ni después, sin markdown):
{{
  "nps_classification": "<promotor|pasivo|detractor>",
  "inferred_score": <1-10>,
  "overall_sentiment": "<positivo|negativo|neutro|mixto>",
  "sentiment_breakdown": {{
    "negative": {neg_score},
    "positive": {pos_score},
    "neutral": {neu_score},
    "mixed": {mix_score}
  }},
  "aspects": [
    {{
      "aspect": "<nombre exacto del aspecto de la lista de arriba>",
      "sentiment": "<positivo|negativo|neutro>",
      "confidence": <0.5-1.0>,
      "quote": "<frase exacta copiada del texto del cliente>"
    }}
  ],
  "dominant_emotion": "<satisfacción|frustración|enojo|indiferencia|sorpresa_positiva|decepción>",
  "churn_risk": "<alto|medio|bajo>",
  "urgency": <true|false>,
  "urgency_reason": "<razón específica mencionando qué indicador la activa, o null>",
  "industry": "{industry}",
  "summary": "<1-2 oraciones resumiendo el feedback en español>",
  "recommended_action": "<acción específica y accionable para el equipo de la empresa>"
}}"""

    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 1000,
        "messages": [{"role": "user", "content": prompt}],
    }

    response = _bedrock.invoke_model(
        modelId=MODEL_ID,
        body=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        contentType="application/json",
        accept="application/json",
    )

    raw    = response["body"].read()
    result = json.loads(raw.decode("utf-8"))
    text_r = result["content"][0]["text"].strip()

    usage = result.get("usage", {})
    print(f"[sentio] Tokens — input: {usage.get('input_tokens','?')} "
          f"output: {usage.get('output_tokens','?')}")

    if not text_r:
        raise ValueError("Bedrock devolvió respuesta vacía")

    parsed = _parse_json(text_r)
    if not parsed:
        raise ValueError(f"JSON no parseable: {text_r[:200]}")

    return parsed


def _parse_json(text: str) -> dict:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return {}


# ── Fallback ──────────────────────────────────────────────────────────────────

def _fallback(text: str, sentiment: dict) -> dict:
    label  = sentiment.get("Sentiment", "NEUTRAL")
    scores = sentiment.get("SentimentScore", {})
    neg    = scores.get("Negative", 0)
    pos    = scores.get("Positive", 0)

    if pos > 0.6:
        nps_class = "promotor"
        score     = 9
        churn     = "bajo"
        emotion   = "satisfacción"
        summary   = "El cliente expresa una experiencia positiva."
        action    = "Mantener la calidad del servicio."
    elif neg > 0.6:
        nps_class = "detractor"
        score     = 3
        churn     = "alto"
        emotion   = "frustración"
        summary   = "El cliente expresa una experiencia negativa."
        action    = "Contactar al cliente para resolver el problema."
    else:
        nps_class = "pasivo"
        score     = 7
        churn     = "medio"
        emotion   = "indiferencia"
        summary   = "El cliente expresa una experiencia neutral."
        action    = "Identificar oportunidades de mejora."

    neg_pct = round(neg * 100)
    pos_pct = round(pos * 100)
    neu_pct = 100 - neg_pct - pos_pct

    return {
        "nps_classification": nps_class,
        "inferred_score":     score,
        "overall_sentiment":  label.lower(),
        "sentiment_breakdown": {
            "negative": neg_pct,
            "positive": pos_pct,
            "neutral":  max(0, neu_pct),
            "mixed":    0,
        },
        "aspects":          [],
        "dominant_emotion": emotion,
        "churn_risk":       churn,
        "urgency":          neg > 0.8,
        "urgency_reason":   "Alto nivel de negatividad detectado" if neg > 0.8 else None,
        "industry":         "general",
        "summary":          summary,
        "recommended_action": action,
    }