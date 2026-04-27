"""
Aggregator — Sentio
Calcula métricas agregadas por período a partir de los análisis guardados en DynamoDB.
Un período es un mes calendario en formato YYYY-MM.
"""

from decimal import Decimal
from services.history import get_analyses_by_period


def _to_float(val):
    if isinstance(val, Decimal):
        return float(val)
    return val or 0


def _compute_metrics(items: list, period: str, org_id: str) -> dict:
    """Calcula métricas de una lista de análisis individuales."""
    total = len(items)
    if total == 0:
        return {
            "period":         period,
            "org_id":         org_id,
            "total_analyzed": 0,
            "nps_score":      None,
            "error":          "Sin datos para este período",
        }

    promoters  = sum(1 for i in items if i.get("nps_classification") == "promotor")
    passives   = sum(1 for i in items if i.get("nps_classification") == "pasivo")
    detractors = sum(1 for i in items if i.get("nps_classification") == "detractor")
    nps_score  = round(((promoters - detractors) / total) * 100)

    urgent_count    = sum(1 for i in items if i.get("urgency") is True or i.get("urgency") == "true")
    high_churn_count = sum(1 for i in items if i.get("churn_risk") == "alto")

    # Aspectos
    aspect_map = {}
    for item in items:
        aspects = item.get("aspects") or []
        if isinstance(aspects, str):
            import json
            try:
                aspects = json.loads(aspects)
            except Exception:
                aspects = []
        for a in aspects:
            name = a.get("aspect", "")
            if not name:
                continue
            if name not in aspect_map:
                aspect_map[name] = {"aspect": name, "total_mentions": 0, "positive": 0, "negative": 0}
            aspect_map[name]["total_mentions"] += 1
            if a.get("sentiment") == "positivo":
                aspect_map[name]["positive"] += 1
            elif a.get("sentiment") == "negativo":
                aspect_map[name]["negative"] += 1

    top_aspects = sorted(aspect_map.values(), key=lambda x: x["total_mentions"], reverse=True)[:10]
    for a in top_aspects:
        t = a["total_mentions"]
        a["negative_pct"] = round(a["negative"] / t * 100) if t else 0
        a["positive_pct"] = round(a["positive"] / t * 100) if t else 0

    # Emociones
    emotion_map = {
        "satisfacción":      0,
        "frustración":       0,
        "enojo":             0,
        "indiferencia":      0,
        "decepción":         0,
        "sorpresa_positiva": 0,
    }
    for item in items:
        e = item.get("dominant_emotion", "")
        if e in emotion_map:
            emotion_map[e] += 1

    # Industria
    industry_map = {}
    for item in items:
        ind = item.get("industry", "general")
        industry_map[ind] = industry_map.get(ind, 0) + 1

    return {
        "period":             period,
        "org_id":             org_id,
        "total_analyzed":     total,
        "nps_score":          nps_score,
        "promoters":          promoters,
        "promoters_pct":      round(promoters  / total * 100, 1),
        "passives":           passives,
        "passives_pct":       round(passives   / total * 100, 1),
        "detractors":         detractors,
        "detractors_pct":     round(detractors / total * 100, 1),
        "urgent_count":       urgent_count,
        "high_churn_count":   high_churn_count,
        "top_aspects":        top_aspects,
        "dominant_emotions":  emotion_map,
        "industry_breakdown": industry_map,
    }


def get_period_metrics(org_id: str, period: str) -> dict:
    """Devuelve las métricas de un período específico (YYYY-MM)."""
    print(f"[aggregator] get_period_metrics org={org_id} period={period}")
    items = get_analyses_by_period(org_id, period)
    return _compute_metrics(items, period, org_id)


def get_trend(org_id: str, periods: list) -> list:
    """Devuelve métricas de múltiples períodos, ordenados ascendentemente."""
    periods_sorted = sorted(set(periods))
    result = []
    for p in periods_sorted:
        metrics = get_period_metrics(org_id, p)
        result.append(metrics)
    return result


def compare_periods(org_id: str, period_a: str, period_b: str) -> dict:
    """Compara dos períodos y calcula la variación de cada métrica."""
    print(f"[aggregator] compare_periods org={org_id} {period_a} vs {period_b}")
    ma = get_period_metrics(org_id, period_a)
    mb = get_period_metrics(org_id, period_b)

    nps_a = ma.get("nps_score")
    nps_b = mb.get("nps_score")

    if nps_a is not None and nps_b is not None:
        nps_change = nps_b - nps_a
        nps_dir    = "up" if nps_change > 0 else ("down" if nps_change < 0 else "stable")
    else:
        nps_change = None
        nps_dir    = "stable"

    def delta(a, b):
        if a is None or b is None:
            return None
        return b - a

    def direction(change):
        if change is None:
            return "stable"
        return "up" if change > 0 else ("down" if change < 0 else "stable")

    # Comparación de aspectos
    aspects_a = {a["aspect"]: a for a in ma.get("top_aspects", [])}
    aspects_b = {a["aspect"]: a for a in mb.get("top_aspects", [])}
    all_aspects = set(aspects_a) | set(aspects_b)

    aspects_comparison = []
    for asp in all_aspects:
        neg_a = aspects_a[asp]["negative_pct"] if asp in aspects_a else 0
        neg_b = aspects_b[asp]["negative_pct"] if asp in aspects_b else 0
        change = neg_b - neg_a

        if abs(change) < 5:
            asp_dir = "stable"
        elif change < 0:
            asp_dir = "improved"
        else:
            asp_dir = "worsened"

        aspects_comparison.append({
            "aspect":               asp,
            "period_a_negative_pct": neg_a,
            "period_b_negative_pct": neg_b,
            "change":               change,
            "direction":            asp_dir,
        })

    aspects_comparison.sort(key=lambda x: abs(x["change"]), reverse=True)

    # Resumen automático
    improved = [a for a in aspects_comparison if a["direction"] == "improved"]
    worsened = [a for a in aspects_comparison if a["direction"] == "worsened"]
    parts    = []
    if nps_change is not None:
        parts.append(f"El NPS {'mejoró' if nps_change > 0 else 'empeoró'} {abs(nps_change)} puntos.")
    if improved:
        parts.append(f"{improved[0]['aspect'].capitalize()} mejoró ({improved[0]['change']:+d}% negativo).")
    if worsened:
        parts.append(f"{worsened[0]['aspect'].capitalize()} empeoró ({worsened[0]['change']:+d}% negativo).")
    summary = " ".join(parts) if parts else "Sin cambios significativos entre períodos."

    total_change  = delta(ma.get("total_analyzed"), mb.get("total_analyzed"))
    urgent_change = delta(ma.get("urgent_count"),   mb.get("urgent_count"))
    churn_change  = delta(ma.get("high_churn_count"), mb.get("high_churn_count"))

    return {
        "period_a":           period_a,
        "period_b":           period_b,
        "metrics_a":          ma,
        "metrics_b":          mb,
        "nps_change":         nps_change,
        "nps_direction":      nps_dir,
        "total_change":       total_change,
        "total_direction":    direction(total_change),
        "urgent_change":      urgent_change,
        "churn_change":       churn_change,
        "aspects_comparison": aspects_comparison,
        "summary":            summary,
    }
