"""
Benchmark interno — Sentio
Compara el NPS actual contra el historial propio de la organización.
"""

import os
import json
import boto3
from datetime import datetime, timezone
from decimal import Decimal
from botocore.exceptions import BotoCoreError, ClientError

_dynamo     = boto3.resource("dynamodb", region_name="us-east-1")
_table_name = os.environ.get("TABLE_NAME", "sentio-analyses-dev")
_table      = _dynamo.Table(_table_name)


def _to_int(val):
    if isinstance(val, Decimal):
        return int(val)
    return val or 0


def get_benchmark(org_id: str) -> dict:
    """Calcula el benchmark interno usando todo el historial del org_id."""
    try:
        Attr  = boto3.dynamodb.conditions.Attr
        fexpr = Attr("org_id").eq(org_id) & Attr("type").not_exists()
        resp  = _table.scan(FilterExpression=fexpr)
        items = resp.get("Items", [])
        while "LastEvaluatedKey" in resp:
            resp   = _table.scan(FilterExpression=fexpr,
                                 ExclusiveStartKey=resp["LastEvaluatedKey"])
            items += resp.get("Items", [])
    except (BotoCoreError, ClientError) as e:
        print(f"[benchmark] Error: {e}")
        return {"org_id": org_id, "error": str(e)}

    # Agrupar por período
    period_map: dict[str, list] = {}
    for item in items:
        ts = item.get("timestamp", "")
        if not ts:
            continue
        period = ts[:7]
        period_map.setdefault(period, []).append(item)

    if not period_map:
        return {
            "org_id":                  org_id,
            "total_periods_with_data": 0,
            "historical_nps":          [],
            "best_period":             None,
            "worst_period":            None,
            "average_nps":             None,
            "current_period":          datetime.now(timezone.utc).strftime("%Y-%m"),
            "current_nps":             None,
            "vs_average":              None,
            "vs_best":                 None,
            "general_trend":           "sin_datos",
            "trend_description":       "No hay datos históricos disponibles",
        }

    # Calcular NPS por período
    historical_nps = []
    for period, period_items in sorted(period_map.items()):
        prom = sum(1 for i in period_items if i.get("nps_classification") == "promotor")
        det  = sum(1 for i in period_items if i.get("nps_classification") == "detractor")
        n    = len(period_items)
        nps  = round(((prom - det) / n) * 100) if n > 0 else 0
        historical_nps.append({
            "period":    period,
            "nps_score": nps,
            "total":     n,
        })

    best  = max(historical_nps, key=lambda x: x["nps_score"])
    worst = min(historical_nps, key=lambda x: x["nps_score"])
    avg   = round(sum(p["nps_score"] for p in historical_nps) / len(historical_nps), 1)

    current_period = datetime.now(timezone.utc).strftime("%Y-%m")
    current_entry  = next((p for p in reversed(historical_nps) if p["period"] == current_period), None)
    if not current_entry and historical_nps:
        current_entry = historical_nps[-1]
    current_nps = current_entry["nps_score"] if current_entry else None

    vs_average = round(current_nps - avg, 1) if current_nps is not None else None
    vs_best    = (current_nps - best["nps_score"]) if current_nps is not None else None

    # Calcular tendencia con los últimos 3 períodos
    last3 = [p["nps_score"] for p in historical_nps[-3:]]
    general_trend, trend_description = _compute_trend(last3, historical_nps)

    return {
        "org_id":                  org_id,
        "total_periods_with_data": len(historical_nps),
        "historical_nps":          historical_nps,
        "best_period":             best,
        "worst_period":            worst,
        "average_nps":             avg,
        "current_period":          current_period,
        "current_nps":             current_nps,
        "vs_average":              vs_average,
        "vs_best":                 vs_best,
        "general_trend":           general_trend,
        "trend_description":       trend_description,
    }


def _compute_trend(last3: list, historical_nps: list) -> tuple:
    if len(historical_nps) < 2:
        return "sin_datos", "Se necesitan al menos 2 períodos para calcular tendencia"

    if len(last3) >= 3:
        bajando   = last3[0] > last3[1] > last3[2]
        subiendo  = last3[0] < last3[1] < last3[2]
        if bajando:
            return "bajando", f"El NPS bajó {len(last3)} meses consecutivos"
        if subiendo:
            return "subiendo", f"El NPS subió {len(last3)} meses consecutivos"
        # ¿Recuperación? último es mejor que el penúltimo pero no que el primero
        if last3[2] > last3[1] and last3[1] < last3[0]:
            worst_period = historical_nps[-2]["period"] if len(historical_nps) >= 2 else "—"
            return "recuperando", f"El NPS se está recuperando desde {worst_period}"
        return "variable", "El NPS muestra variación sin tendencia clara"

    # Solo 2 períodos
    if last3[0] > last3[1]:
        return "bajando", "El NPS bajó 2 meses consecutivos"
    if last3[0] < last3[1]:
        return "subiendo", "El NPS subió 2 meses consecutivos"
    return "estable", "El NPS se mantiene estable"
