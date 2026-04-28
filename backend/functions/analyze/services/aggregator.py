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


def get_period_metrics(org_id: str, period: str, canal: str = None) -> dict:
    """Devuelve las métricas de un período específico (YYYY-MM), opcionalmente filtrado por canal."""
    print(f"[aggregator] get_period_metrics org={org_id} period={period} canal={canal}")
    items = get_analyses_by_period(org_id, period)
    if canal:
        items = [i for i in items if i.get("source") == canal]
    return _compute_metrics(items, period, org_id)


def get_trend(org_id: str, periods: list, canal: str = None) -> list:
    """Devuelve métricas de múltiples períodos, ordenados ascendentemente."""
    periods_sorted = sorted(set(periods))
    result = []
    for p in periods_sorted:
        metrics = get_period_metrics(org_id, p, canal=canal)
        result.append(metrics)
    return result


def get_channel_breakdown(org_id: str, period: str) -> dict:
    """Calcula NPS y métricas desglosadas por canal para un período."""
    print(f"[aggregator] get_channel_breakdown org={org_id} period={period}")
    items = get_analyses_by_period(org_id, period)

    canal_map = {}
    for item in items:
        canal = item.get("source", "manual")
        if canal not in canal_map:
            canal_map[canal] = []
        canal_map[canal].append(item)

    channels = []
    for canal, canal_items in canal_map.items():
        n          = len(canal_items)
        promoters  = sum(1 for i in canal_items if i.get("nps_classification") == "promotor")
        detractors = sum(1 for i in canal_items if i.get("nps_classification") == "detractor")
        nps_score  = round(((promoters - detractors) / n) * 100)
        channels.append({
            "canal":           canal,
            "total":           n,
            "nps_score":       nps_score,
            "promoters_pct":   round(promoters  / n * 100),
            "detractors_pct":  round(detractors / n * 100),
            "urgent_count":    sum(1 for i in canal_items if i.get("urgency") is True),
            "high_churn_count": sum(1 for i in canal_items if i.get("churn_risk") == "alto"),
        })

    channels.sort(key=lambda x: x["total"], reverse=True)
    return {"period": period, "channels": channels}


def get_home_summary(org_id: str) -> dict:
    """Resumen ejecutivo para la pantalla Home: período actual vs anterior."""
    from datetime import datetime, timezone, timedelta

    now     = datetime.now(timezone.utc)
    cur_p   = now.strftime("%Y-%m")
    prev_dt = (now.replace(day=1) - timedelta(days=1))
    prev_p  = prev_dt.strftime("%Y-%m")

    current_items  = get_analyses_by_period(org_id, cur_p)
    previous_items = get_analyses_by_period(org_id, prev_p)

    def _summary_from(items):
        n = len(items)
        if n == 0:
            return {"nps_score": None, "total_analyzed": 0, "urgent_count": 0,
                    "high_churn_count": 0, "promoters_pct": None, "detractors_pct": None}
        prom = sum(1 for i in items if i.get("nps_classification") == "promotor")
        det  = sum(1 for i in items if i.get("nps_classification") == "detractor")
        return {
            "nps_score":         round(((prom - det) / n) * 100),
            "total_analyzed":    n,
            "urgent_count":      sum(1 for i in items if i.get("urgency") is True),
            "high_churn_count":  sum(1 for i in items if i.get("churn_risk") == "alto"),
            "promoters_pct":     round(prom / n * 100, 1),
            "detractors_pct":    round(det  / n * 100, 1),
        }

    cur_m  = _summary_from(current_items)
    prev_m = _summary_from(previous_items)

    def _delta(a, b):
        if a is None or b is None:
            return None
        return b - a

    has_data = cur_m["total_analyzed"] > 0

    # Top urgentes — 5 más recientes del período actual
    urgents = sorted(
        [i for i in current_items if i.get("urgency") is True],
        key=lambda x: x.get("timestamp", ""),
        reverse=True,
    )[:5]
    top_urgent = [
        {
            "customer_id":   i.get("customer_id") or "—",
            "input_preview": (i.get("input_preview") or i.get("input") or "")[:100],
            "urgency_reason": i.get("urgency_reason"),
            "churn_risk":    i.get("churn_risk", "medio"),
            "timestamp":     i.get("timestamp", ""),
        }
        for i in urgents
    ]

    # Aspectos críticos — negative_pct >= 70% y >= 3 menciones
    metrics_cur    = _compute_metrics(current_items, cur_p, org_id)
    critical_aspects = [
        {"aspect": a["aspect"], "negative_pct": a["negative_pct"], "total_mentions": a["total_mentions"]}
        for a in metrics_cur.get("top_aspects", [])
        if a["negative_pct"] >= 70 and a["total_mentions"] >= 3
    ]
    critical_aspects.sort(key=lambda x: x["negative_pct"], reverse=True)
    critical_aspects = critical_aspects[:5]

    # Métricas de resolución del período actual
    resolution = {"pending": 0, "in_progress": 0, "resolved": 0, "resolution_rate_pct": 0}
    try:
        from services.urgent_manager import get_resolution_metrics as _res_metrics
        rm = _res_metrics(org_id, cur_p)
        resolution = {
            "pending":             rm.get("pending", 0),
            "in_progress":         rm.get("in_progress", 0),
            "resolved":            rm.get("resolved", 0),
            "resolution_rate_pct": rm.get("resolution_rate_pct", 0),
        }
    except Exception as e:
        print(f"[aggregator] resolution metrics error: {e}")

    return {
        "org_id":          org_id,
        "current_period":  cur_p,
        "previous_period": prev_p,
        "current":         cur_m,
        "previous":        prev_m,
        "deltas": {
            "nps_change":    _delta(prev_m["nps_score"],         cur_m["nps_score"]),
            "total_change":  _delta(prev_m["total_analyzed"],    cur_m["total_analyzed"]),
            "urgent_change": _delta(prev_m["urgent_count"],      cur_m["urgent_count"]),
            "churn_change":  _delta(prev_m["high_churn_count"],  cur_m["high_churn_count"]),
        },
        "top_urgent":        top_urgent,
        "critical_aspects":  critical_aspects,
        "has_data":          has_data,
        "resolution":        resolution,
    }


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
