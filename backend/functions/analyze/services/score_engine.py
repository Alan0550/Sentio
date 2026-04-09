"""
Motor de score — mock de Amazon Bedrock (Claude).
Recibe los resultados de Comprehend y Rekognition y genera:
  - Score final del 1 al 100
  - Nivel de credibilidad
  - Señales con su estado
  - Explicación en español

Cuando se conecte AWS, este módulo llama a Bedrock con un prompt
que incluye los datos de Comprehend y Rekognition.
"""


def calculate_score(text_analysis: dict, image_analysis: dict) -> dict:
    """
    Calcula el score de credibilidad basado en los análisis.
    Retorna la estructura final que recibe el frontend.
    """
    score  = 100
    signals = []

    # ── 1. Sentimiento ────────────────────────────────────────────────────────
    sentiment     = text_analysis["sentiment"]["Sentiment"]
    neg_score_val = text_analysis["sentiment"]["SentimentScore"]["Negative"]

    if sentiment == "NEGATIVE" and neg_score_val > 0.6:
        score -= 25
        sentiment_status = "danger"
        sentiment_detail = "Lenguaje predominantemente negativo y alarmista"
    elif sentiment in ("NEGATIVE", "MIXED") or neg_score_val > 0.3:
        score -= 12
        sentiment_status = "warning"
        sentiment_detail = "Lenguaje con carga emocional elevada"
    else:
        sentiment_status = "ok"
        sentiment_detail = "Lenguaje neutro y objetivo"

    signals.append({
        "id":     "sentiment",
        "label":  "Tono del lenguaje",
        "detail": sentiment_detail,
        "status": sentiment_status,
    })

    # ── 2. Fuentes citadas ────────────────────────────────────────────────────
    source_count = text_analysis["sources"]["count"]

    if source_count == 0:
        score -= 25
        source_status = "danger"
        source_detail = "No se detectaron fuentes verificables"
    elif source_count <= 2:
        score -= 8
        source_status = "warning"
        source_detail = f"Pocas fuentes citadas ({source_count} encontradas)"
    else:
        source_status = "ok"
        source_detail = f"Fuentes citadas correctamente ({source_count} encontradas)"

    signals.append({
        "id":     "sources",
        "label":  "Fuentes citadas",
        "detail": source_detail,
        "status": source_status,
    })

    # ── 3. Entidades identificadas ────────────────────────────────────────────
    entities     = text_analysis["entities"]
    entity_count = len(entities)

    if entity_count >= 3:
        entity_status = "ok"
        entity_detail = f"Se identificaron {entity_count} entidades (personas, org., lugares)"
    elif entity_count >= 1:
        entity_status = "warning"
        entity_detail = f"Pocas entidades identificadas ({entity_count})"
    else:
        score -= 10
        entity_status = "warning"
        entity_detail = "No se identificaron entidades concretas en el texto"

    signals.append({
        "id":     "entities",
        "label":  "Entidades identificadas",
        "detail": entity_detail,
        "status": entity_status,
    })

    # ── 4. Sensacionalismo ────────────────────────────────────────────────────
    sens = text_analysis["sensationalism"]

    if sens["is_sensationalist"]:
        score -= 20
        sens_status = "danger"
        words_found = ", ".join(sens["sensationalist_words"][:3])
        sens_detail = f"Lenguaje sensacionalista detectado: {words_found}" if words_found else "Uso excesivo de mayúsculas o exclamaciones"
    elif sens["caps_ratio"] > 0.1 or sens["exclamations"] >= 1:
        score -= 8
        sens_status = "warning"
        sens_detail = "Presencia moderada de patrones de clickbait"
    else:
        sens_status = "ok"
        sens_detail = "No se detectaron patrones sensacionalistas"

    signals.append({
        "id":     "clickbait",
        "label":  "Titular sensacionalista",
        "detail": sens_detail,
        "status": sens_status,
    })

    # ── 5. Imágenes (si aplica) ───────────────────────────────────────────────
    if image_analysis["images_found"] > 0:
        if image_analysis["summary"]["has_explicit_content"]:
            score -= 15
            img_status = "danger"
            img_detail = "Se detectó contenido visual inapropiado"
        else:
            img_status = "ok"
            img_detail = f"{image_analysis['images_found']} imágenes analizadas sin anomalías"

        signals.append({
            "id":     "images",
            "label":  "Análisis de imágenes",
            "detail": img_detail,
            "status": img_status,
        })

    # ── Score final ───────────────────────────────────────────────────────────
    score = max(5, min(100, score))

    if score >= 75:
        level = "creíble"
    elif score >= 45:
        level = "dudoso"
    else:
        level = "peligroso"

    explanation = _build_explanation(score, level, signals, text_analysis)

    return {
        "score":       score,
        "level":       level,
        "explanation": explanation,
        "signals":     signals,
        "disclaimer":  (
            "TruthLens estima señales de desinformación mediante IA. "
            "No determina la veracidad absoluta del contenido."
        ),
    }


def _build_explanation(score: int, level: str, signals: list, text_analysis: dict) -> str:
    """Genera una explicación en lenguaje natural basada en los resultados."""

    danger_signals  = [s for s in signals if s["status"] == "danger"]
    warning_signals = [s for s in signals if s["status"] == "warning"]

    if level == "creíble":
        base = (
            f"El contenido presenta características de información verificable. "
            f"Se detectaron fuentes citadas y el lenguaje es predominantemente objetivo. "
        )
        if warning_signals:
            base += f"Sin embargo, hay {len(warning_signals)} aspecto(s) a considerar con cautela. "
        base += "Se recomienda igual contrastar con otras fuentes antes de compartir."

    elif level == "dudoso":
        base = (
            f"El contenido presenta señales mixtas de credibilidad. "
        )
        if danger_signals:
            issues = " y ".join([s["label"].lower() for s in danger_signals[:2]])
            base += f"Los principales problemas detectados son: {issues}. "
        if warning_signals:
            base += f"Además, hay {len(warning_signals)} señal(es) de alerta moderada. "
        base += "Se recomienda contrastar con medios verificados antes de compartir."

    else:
        base = (
            f"El contenido presenta múltiples señales de posible desinformación. "
        )
        if danger_signals:
            issues = ", ".join([s["label"].lower() for s in danger_signals])
            base += f"Se detectaron problemas críticos en: {issues}. "
        base += "Se recomienda no compartir este contenido sin verificación independiente."

    return base
