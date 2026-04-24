"""
Motor de score — Amazon Bedrock (Claude Haiku).
Bedrock recibe el texto completo + señales + búsqueda web + validación de medios.
Si Bedrock falla, el score pre-calculado por Python sirve de fallback.
"""

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

MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0"


def _score_to_level(score: int) -> str:
    if score >= 75:
        return "creíble"
    if score >= 45:
        return "dudoso"
    return "peligroso"


# ── Clasificación de tipo de noticia ─────────────────────────────────────────

_HEALTH_SCIENCE_KW = {
    "salud", "enfermedad", "virus", "bacteria", "vacuna", "medicamento",
    "tratamiento", "síntoma", "diagnóstico", "hospital", "médico", "doctor",
    "científico", "laboratorio", "cáncer", "diabetes", "covid", "pandemia",
    "epidemia", "contagio", "fármaco", "cura", "terapia", "genética",
    "adn", "proteína", "sustancia", "compuesto", "química", "radiación",
    "tecnología", "inteligencia artificial", "algoritmo", "5g", "microchip",
}

_ECON_POLITICAL_KW = {
    "economía", "político", "política", "gobierno", "presidente", "congreso",
    "senado", "ministerio", "elecciones", "partido", "candidato", "inflación",
    "pib", "presupuesto", "impuesto", "deuda", "reforma", "ley", "decreto",
    "parlamento", "diputado", "senador", "alcalde", "gobernador", "dólar",
    "banco central", "reservas", "inversión", "mercado", "bolsa",
    "exportación", "importación", "aranceles", "déficit", "gasto público",
}


def classify_news_type(text: str) -> str:
    text_lower = text.lower()
    health_hits = sum(1 for kw in _HEALTH_SCIENCE_KW   if kw in text_lower)
    econ_hits   = sum(1 for kw in _ECON_POLITICAL_KW   if kw in text_lower)

    if health_hits >= 2 and health_hits >= econ_hits:
        return "salud/ciencia/tecnología"
    if econ_hits >= 2 and econ_hits > health_hits:
        return "económica/política"
    return "general"


# ── Score principal ───────────────────────────────────────────────────────────

def calculate_score(text_analysis: dict, image_analysis: dict, text: str = "") -> dict:
    score   = 100
    signals = []

    # ── 1. Sentimiento ────────────────────────────────────────────────────────
    sentiment     = text_analysis["sentiment"]["Sentiment"]
    neg_score_val = text_analysis["sentiment"]["SentimentScore"]["Negative"]

    if sentiment == "NEGATIVE" and neg_score_val > 0.6:
        score -= 25; sent_status = "danger"
        sent_detail = "Lenguaje predominantemente negativo y alarmista"
    elif sentiment in ("NEGATIVE", "MIXED") or neg_score_val > 0.3:
        score -= 12; sent_status = "warning"
        sent_detail = "Lenguaje con carga emocional elevada"
    else:
        sent_status = "ok"
        sent_detail = "Lenguaje neutro y objetivo"

    signals.append({"id": "sentiment", "label": "Tono del lenguaje",
                    "detail": sent_detail, "status": sent_status})

    # ── 2. Fuentes ────────────────────────────────────────────────────────────
    sources    = text_analysis["sources"]
    net_named  = sources["count"]
    anon_count = sources["anonymous_count"]

    if anon_count > 0 and net_named == 0:
        score -= 35; src_status = "danger"
        src_detail = f"Solo fuentes anónimas no verificables ({anon_count} detectadas)"
    elif net_named == 0:
        score -= 20; src_status = "danger"
        src_detail = "No se detectaron fuentes verificables"
    elif net_named <= 2:
        score -= 8; src_status = "warning"
        anon_note  = f" +{anon_count} anónimas" if anon_count else ""
        src_detail = f"Pocas fuentes verificables ({net_named}{anon_note})"
    else:
        src_status = "ok"
        anon_note  = f" +{anon_count} anónimas" if anon_count else ""
        src_detail = f"Fuentes verificables citadas ({net_named}{anon_note})"

    signals.append({"id": "sources", "label": "Fuentes citadas",
                    "detail": src_detail, "status": src_status})

    # ── 3. Entidades ──────────────────────────────────────────────────────────
    entity_count = len(text_analysis["entities"])

    if entity_count == 0:
        score -= 10; ent_status = "warning"
        ent_detail = "No se identificaron entidades concretas en el texto"
    else:
        ent_status = "ok"
        ent_detail = f"Se identificaron {entity_count} entidades en el texto"

    signals.append({"id": "entities", "label": "Entidades identificadas",
                    "detail": ent_detail, "status": ent_status})

    # ── 4. Sensacionalismo ────────────────────────────────────────────────────
    sens = text_analysis["sensationalism"]

    if sens["is_sensationalist"]:
        score -= 20; sens_status = "danger"
        words_found = ", ".join(sens["sensationalist_words"][:3])
        sens_detail = (f"Lenguaje sensacionalista: {words_found}"
                       if words_found else "Uso excesivo de mayúsculas o exclamaciones")
    elif sens["caps_ratio"] > 0.1 or sens["exclamations"] >= 2:
        score -= 8; sens_status = "warning"
        sens_detail = "Presencia moderada de patrones de clickbait"
    else:
        sens_status = "ok"
        sens_detail = "No se detectaron patrones sensacionalistas"

    signals.append({"id": "clickbait", "label": "Titular sensacionalista",
                    "detail": sens_detail, "status": sens_status})

    # ── 5. Lenguaje conspirativo ──────────────────────────────────────────────
    conspiracy    = text_analysis.get("conspiracy", {})
    pattern_count = conspiracy.get("pattern_count", 0)

    if pattern_count >= 2:
        score -= 35; con_status = "danger"
        con_detail = f"Múltiples patrones conspirativos detectados ({pattern_count})"
    elif pattern_count == 1:
        score -= 20; con_status = "danger"
        con_detail = "Lenguaje conspirativo detectado"
    else:
        con_status = "ok"
        con_detail = "No se detectaron patrones conspirativos"

    signals.append({"id": "conspiracy", "label": "Lenguaje conspirativo",
                    "detail": con_detail, "status": con_status})

    # ── 6. Validación de medios ───────────────────────────────────────────────
    media_val = text_analysis.get("media_validation", {})
    url_check  = media_val.get("url_check", {})
    mentions   = media_val.get("mentions", {})

    if url_check.get("trusted"):
        med_status = "ok"
        med_detail = f"URL de origen verificada: {url_check.get('domain', '')}"
    elif url_check.get("checked") and not url_check.get("trusted"):
        score -= 5; med_status = "warning"
        med_detail = f"Dominio de origen no está en lista de medios verificados ({url_check.get('domain', '')})"
    elif mentions.get("suspicious_mention"):
        score -= 15; med_status = "danger"
        med_detail = "Se menciona un medio serio de forma sospechosa o conspirativa"
    elif mentions.get("has_trusted_mention"):
        med_status = "warning"
        names = ", ".join(mentions.get("mentioned_media", [])[:3])
        med_detail = f"Menciona medios conocidos ({names}) pero no se puede verificar si lo publicaron"
    else:
        med_status = "ok"
        med_detail = "Sin menciones de medios para validar"

    signals.append({"id": "media", "label": "Validación de medios",
                    "detail": med_detail, "status": med_status})

    # ── 7. Imágenes ───────────────────────────────────────────────────────────
    if image_analysis["images_found"] > 0:
        if image_analysis["summary"]["has_explicit_content"]:
            score -= 15; img_status = "danger"
            img_detail = "Se detectó contenido visual inapropiado"
        else:
            img_status = "ok"
            img_detail = f"{image_analysis['images_found']} imágenes analizadas sin anomalías"
        signals.append({"id": "images", "label": "Análisis de imágenes",
                        "detail": img_detail, "status": img_status})

    # ── Score preliminar ──────────────────────────────────────────────────────
    py_score = max(5, min(100, score))

    # ── Bedrock: scorer primario ──────────────────────────────────────────────
    explanation, bedrock_score = _call_bedrock(text_analysis, signals, text, py_score)

    final_score = bedrock_score if bedrock_score is not None else py_score
    final_score = max(1, min(100, final_score))
    final_level = _score_to_level(final_score)

    return {
        "score":       final_score,
        "level":       final_level,
        "explanation": explanation,
        "signals":     signals,
        "disclaimer":  "TruthLens estima señales de desinformación mediante IA. No determina la veracidad absoluta del contenido.",
    }


# ── Bedrock ───────────────────────────────────────────────────────────────────

def _call_bedrock(text_analysis: dict, signals: list,
                  text: str, py_score: int) -> tuple:
    t0 = time.time()
    print(f"[score_engine] Llamando a Bedrock — py_score={py_score}")
    try:
        result  = _bedrock_request(text_analysis, signals, text, py_score)
        elapsed = round(time.time() - t0, 2)
        print(f"[score_engine] Bedrock OK — {elapsed}s  score={result[1]}")
        return result
    except Exception as e:
        elapsed = round(time.time() - t0, 2)
        print(f"[score_engine] Bedrock FALLÓ ({elapsed}s): {e}")
        return _fallback_explanation(py_score, signals, text_analysis), None


def _bedrock_request(text_analysis: dict, signals: list,
                     text: str, py_score: int) -> tuple:
    sources    = text_analysis["sources"]
    sens       = text_analysis["sensationalism"]
    conspiracy = text_analysis.get("conspiracy", {})
    sentiment  = text_analysis["sentiment"]["Sentiment"]
    media_val  = text_analysis.get("media_validation", {})
    web_results = text_analysis.get("web_results", [])

    net_named    = sources["count"]
    anon_count   = sources["anonymous_count"]
    sens_words   = sens["sensationalist_words"]
    con_count    = conspiracy.get("pattern_count", 0)
    entity_count = len(text_analysis["entities"])
    news_type    = classify_news_type(text)

    danger_labels  = [s["label"] for s in signals if s["status"] == "danger"]
    warning_labels = [s["label"] for s in signals if s["status"] == "warning"]

    truncated = " ".join(text.split()[:1500]) if text.strip() else "(sin texto)"

    # ── Sección de búsqueda web ───────────────────────────────────────────────
    if web_results:
        web_lines = "\n".join(
            f"  {i+1}. [{r['title']}] {r['url']}\n     {r['description'][:120]}"
            for i, r in enumerate(web_results)
        )
        web_section = f"""RESULTADOS DE BÚSQUEDA WEB (Brave Search — titular de la noticia):
{web_lines}

CÓMO EVALUAR DISCREPANCIAS CON ESTOS RESULTADOS:
- Sin discrepancia: los resultados confirman lo que dice la noticia → suma puntos a favor de credibilidad.
- Discrepancia menor (diferencia <15% en cifras o detalles secundarios que no cambian el hecho principal): penaliza moderado (8-12 puntos). En la explicación indica qué diferencia encontraste, de qué fuentes viene, y recomienda al usuario verificar el dato exacto.
- Discrepancia crítica (diferencia >30% en cifras, o contradicción directa de hechos principales): penaliza fuerte (20-25 puntos). Explica claramente qué dice la noticia, qué dicen los otros medios, y nombra esos medios.
- Ningún medio serio reportó lo mismo: señal de alerta moderada — puede ser exclusiva o inventada."""
    else:
        web_section = "RESULTADOS DE BÚSQUEDA WEB: No disponibles (API no configurada o sin respuesta)."

    # ── Sección de validación de medios ──────────────────────────────────────
    url_check = media_val.get("url_check", {})
    mentions  = media_val.get("mentions", {})

    if url_check.get("trusted"):
        url_status = f"Sí — dominio verificado: {url_check.get('domain')}"
    elif url_check.get("checked"):
        url_status = f"No — dominio no verificado: {url_check.get('domain')}"
    else:
        url_status = "No aplica (el usuario pegó texto directo)"

    mentioned_str  = ", ".join(mentions.get("mentioned_media", [])) or "ninguno"
    suspicious_str = "Sí ⚠️" if mentions.get("suspicious_mention") else "No"
    source_trusted = url_check.get("trusted", False)

    media_section = f"""VALIDACIÓN DE MEDIOS:
- URL de origen verificada: {url_status}
- Medios confiables mencionados en el texto: {mentioned_str}
- Patrón de mención sospechoso (medio serio + lenguaje conspirativo): {suspicious_str}

NOTA: Si el usuario pegó texto directo, que mencione un medio conocido NO garantiza que ese medio lo publicó. Cruza esto con los resultados de búsqueda web para verificar consistencia."""

    # ── Regla de titular sensacionalista + medio verificado ───────────────────
    if source_trusted:
        sensationalism_rule = """REGLA ESPECIAL — TITULAR SENSACIONALISTA EN MEDIO VERIFICADO:
La URL de origen pertenece a un medio verificado. Los medios establecidos usan titulares llamativos por convención editorial, no por intención de engañar.
- Si los resultados de búsqueda web CONFIRMAN el contenido: el titular sensacionalista penaliza MÁXIMO 5 puntos.
- Si los resultados de búsqueda web CONTRADICEN el contenido aunque sea de un medio verificado: penaliza normal (20 puntos). El medio puede estar publicando información incorrecta."""
    else:
        sensationalism_rule = ""

    # ── Nota por tipo de noticia ──────────────────────────────────────────────
    if news_type == "salud/ciencia/tecnología":
        type_note = ("⚠️ TIPO: salud/ciencia/tecnología — Las afirmaciones médicas o científicas "
                     "sin fuente nombrada y verificable son una señal GRAVE. Penaliza fuertemente "
                     "términos inventados, sustancias inexistentes o estudios sin citar.")
    elif news_type == "económica/política":
        type_note = ("ℹ️ TIPO: económica/política — Es normal que este tipo de noticias no incluya "
                     "links directos. Evalúa principalmente el tono, las fuentes nombradas y la "
                     "consistencia con lo que reportan otros medios.")
    else:
        type_note = "ℹ️ TIPO: general — Aplica criterios estándar de verificación."

    prompt = f"""Eres un detector experto en desinformación y noticias falsas. Analiza este contenido con criterio riguroso.

TEXTO A ANALIZAR:
{truncated}

{type_note}

SEÑALES PRE-DETECTADAS (contexto adicional):
- Sentimiento dominante: {sentiment}
- Fuentes verificables nombradas: {net_named}
- Fuentes anónimas detectadas: {anon_count}
- Palabras sensacionalistas: {', '.join(sens_words[:5]) if sens_words else 'ninguna'}
- Patrones conspirativos: {con_count}
- Entidades mencionadas: {entity_count}
- Alertas críticas: {', '.join(danger_labels) if danger_labels else 'ninguna'}
- Advertencias: {', '.join(warning_labels) if warning_labels else 'ninguna'}

{web_section}

{media_section}

{sensationalism_rule}

ANALIZA ESPECÍFICAMENTE:
1. ¿Hay términos científicos inventados o imposibles de verificar?
2. ¿Las fuentes son anónimas o vagas? ¿Coinciden con lo que encontró la búsqueda web?
3. ¿Hay lenguaje conspirativo o urgencia manipuladora para compartir?
4. ¿Usa modo condicional para evitar afirmar ("habría", "podría haber")?
5. ¿Los resultados web confirman, contradicen levemente o contradicen directamente las afirmaciones? (aplica la guía de discrepancias)
6. ¿La mención de medios confiables es consistente con lo que reportan en realidad?
7. ¿Se acumulan múltiples señales rojas? (penaliza exponencialmente)

GUÍA DE SCORE:
- 75-100: Lenguaje neutral, fuentes verificables, afirmaciones respaldadas, consistente con búsqueda web
- 45-74: Señales mixtas, algunas advertencias no determinantes
- 20-44: Múltiples alertas, baja credibilidad
- 1-19: Patrón claro de desinformación: fuentes anónimas + conspiración + contradicción web + ciencia inventada

FORMATO DE EXPLICACIÓN — cuando detectes discrepancias con Brave Search, la explicación DEBE incluir:
- Qué afirma la noticia
- Qué reportan los otros medios (nombrarlos si aparecen en los resultados)
- Si la diferencia es menor, recomendar verificar el dato exacto en esas fuentes
- Si la diferencia es crítica, advertir claramente la contradicción y desaconsejar compartir sin verificar

Responde ÚNICAMENTE con este JSON (sin texto antes ni después):
{{"score": <1-100>, "level": "<creíble|dudoso|peligroso>", "explanation": "<2-4 oraciones directas al usuario en español, sin markdown, con detalle de discrepancias si las hay>"}}"""

    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 600,
        "messages": [{"role": "user", "content": prompt}],
    }

    response = _bedrock.invoke_model(
        modelId=MODEL_ID,
        body=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        contentType="application/json",
        accept="application/json",
    )

    raw      = response["body"].read()
    result   = json.loads(raw.decode("utf-8"))
    raw_text = result["content"][0]["text"].strip()

    usage = result.get("usage", {})
    print(f"[score_engine] Tokens — input: {usage.get('input_tokens','?')} output: {usage.get('output_tokens','?')}")

    if not raw_text:
        raise ValueError("Bedrock devolvió respuesta vacía")

    parsed = _parse_bedrock_json(raw_text)
    if not parsed:
        print("[score_engine] JSON no parseable — usando texto libre como explicación")
        return raw_text[:500], None

    bedrock_score = max(1, min(100, int(parsed.get("score", py_score))))
    explanation   = parsed.get("explanation", "").strip()

    if not explanation:
        raise ValueError("Explicación vacía en respuesta de Bedrock")

    return explanation, bedrock_score


def _parse_bedrock_json(text: str) -> dict:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r'\{[^{}]*"score"[^{}]*\}', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return {}


# ── Fallback local ────────────────────────────────────────────────────────────

def _fallback_explanation(score: int, signals: list, text_analysis: dict) -> str:
    level      = _score_to_level(score)
    sources    = text_analysis["sources"]
    sens_words = text_analysis["sensationalism"]["sensationalist_words"]
    conspiracy = text_analysis.get("conspiracy", {})
    entities   = len(text_analysis["entities"])
    net_named  = sources["count"]
    anon_count = sources["anonymous_count"]

    danger_signals = [s for s in signals if s["status"] == "danger"]
    parts = []

    if level == "creíble":
        parts.append("El contenido utiliza un lenguaje objetivo y cita fuentes verificables, lo que lo hace consistente con información confiable.")
    elif level == "dudoso":
        if danger_signals:
            issues = " y ".join([s["label"].lower() for s in danger_signals[:2]])
            parts.append(f"El contenido presenta problemas en {issues}, lo que reduce su credibilidad.")
        else:
            parts.append("El contenido tiene señales mixtas que generan dudas sobre su confiabilidad.")
    else:
        if conspiracy.get("is_conspiracy") and anon_count > 0:
            parts.append("El contenido combina lenguaje conspirativo con fuentes anónimas no verificables, patrón característico de desinformación deliberada.")
        elif danger_signals:
            issues = ", ".join([s["label"].lower() for s in danger_signals])
            parts.append(f"El contenido presenta múltiples señales de alerta críticas: {issues}.")
        else:
            parts.append("El contenido presenta múltiples características asociadas a desinformación.")

    if conspiracy.get("is_conspiracy") and level != "creíble":
        parts.append("Se detectaron frases diseñadas para generar desconfianza institucional y urgencia para compartir sin verificar.")
    elif anon_count > 0 and net_named == 0:
        parts.append("Las únicas fuentes mencionadas son anónimas o secretas, lo que imposibilita su verificación independiente.")
    elif sens_words:
        parts.append(f"El lenguaje sensacionalista ({', '.join(sens_words[:2])}) busca generar reacción emocional en lugar de informar objetivamente.")
    elif net_named == 0 and level != "creíble":
        parts.append("No se encontraron fuentes citadas que respalden las afirmaciones del texto.")
    elif entities >= 3 and net_named >= 2:
        parts.append(f"Se identificaron {entities} entidades y {net_named} referencias a fuentes, indicando un reportaje más estructurado.")

    if level == "creíble":
        parts.append("Se recomienda igualmente contrastar con otras fuentes antes de compartir.")
    elif level == "dudoso":
        parts.append("Se recomienda verificar en medios reconocidos antes de compartir.")
    else:
        parts.append("No comparta este contenido sin verificación independiente en fuentes confiables.")

    return " ".join(parts)
