"""
Gestor de historial por cliente — Sentio
Permite ver la evolución de un cliente a lo largo del tiempo.
"""

import os
import json
import boto3
from decimal import Decimal
from botocore.exceptions import BotoCoreError, ClientError

_dynamo     = boto3.resource("dynamodb", region_name="us-east-1")
_table_name = os.environ.get("TABLE_NAME", "sentio-analyses-dev")
_table      = _dynamo.Table(_table_name)


def _to_int(val):
    if isinstance(val, Decimal):
        return int(val)
    return val or 0


def _normalize(item: dict) -> dict:
    if isinstance(item.get("aspects"), str):
        try:
            item["aspects"] = json.loads(item["aspects"])
        except Exception:
            item["aspects"] = []
    if isinstance(item.get("sentiment_breakdown"), str):
        try:
            item["sentiment_breakdown"] = json.loads(item["sentiment_breakdown"])
        except Exception:
            item["sentiment_breakdown"] = {}
    for field in ("customer_id", "urgency_reason", "urgent_assignee",
                  "urgent_note", "urgent_updated_at", "urgent_resolved_at"):
        if item.get(field) == "null":
            item[field] = None
    item["inferred_score"] = _to_int(item.get("inferred_score", 5))
    item.setdefault("urgent_status", None)
    return item


def _calculate_trend(analyses: list) -> str:
    if len(analyses) < 2:
        return "sin_datos"
    first_score = _to_int(analyses[0].get("inferred_score", 5))
    last_score  = _to_int(analyses[-1].get("inferred_score", 5))
    diff = last_score - first_score
    if diff >= 2:
        return "mejorando"
    if diff <= -2:
        return "empeorando"
    return "estable"


def _scan_customer(org_id: str, customer_id: str) -> list:
    """Busca todos los análisis de un customer_id en la org, ignorando batch_summary."""
    try:
        Attr = boto3.dynamodb.conditions.Attr
        # Case-insensitive: buscar exacto y también en minúsculas
        fexpr = (
            Attr("org_id").eq(org_id) &
            Attr("customer_id").eq(customer_id) &
            Attr("type").not_exists()
        )
        resp  = _table.scan(FilterExpression=fexpr)
        items = resp.get("Items", [])
        while "LastEvaluatedKey" in resp:
            resp   = _table.scan(FilterExpression=fexpr,
                                 ExclusiveStartKey=resp["LastEvaluatedKey"])
            items += resp.get("Items", [])
        return items
    except (BotoCoreError, ClientError) as e:
        print(f"[customer_manager] Error en _scan_customer: {e}")
        return []


def get_customer_history(org_id: str, customer_id: str) -> dict:
    """Devuelve el historial completo de un cliente, ordenado cronológicamente."""
    items = _scan_customer(org_id, customer_id)

    if not items:
        return {"customer_id": customer_id, "org_id": org_id,
                "total_interactions": 0, "found": False}

    items = [_normalize(i) for i in items]
    items.sort(key=lambda x: x.get("timestamp", ""))

    trend                    = _calculate_trend(items)
    classifications          = [i.get("nps_classification", "pasivo") for i in items]
    predominant              = max(set(classifications), key=classifications.count)
    current                  = items[-1]
    urgent_items             = [i for i in items if i.get("urgency")]
    resolved_urgents         = sum(1 for i in urgent_items if i.get("urgent_status") == "resuelto")

    # Evolución NPS por período
    nps_evolution = []
    seen_periods  = set()
    for item in items:
        period = (item.get("timestamp") or "")[:7]
        if period and period not in seen_periods:
            seen_periods.add(period)
            nps_evolution.append({
                "period":         period,
                "score":          _to_int(item.get("inferred_score", 5)),
                "classification": item.get("nps_classification", "pasivo"),
            })

    # Lista de análisis formateada
    analyses = [
        {
            "id":                  i.get("id"),
            "timestamp":           i.get("timestamp"),
            "period":              (i.get("timestamp") or "")[:7],
            "inferred_score":      _to_int(i.get("inferred_score", 5)),
            "nps_classification":  i.get("nps_classification", "pasivo"),
            "churn_risk":          i.get("churn_risk", "medio"),
            "urgency":             bool(i.get("urgency", False)),
            "urgent_status":       i.get("urgent_status"),
            "urgent_assignee":     i.get("urgent_assignee"),
            "urgent_note":         i.get("urgent_note"),
            "dominant_emotion":    i.get("dominant_emotion"),
            "input_preview":       (i.get("input_preview") or i.get("input") or "")[:300],
            "aspects":             i.get("aspects", []),
            "summary":             i.get("summary", ""),
            "source":              i.get("source", "manual"),
        }
        for i in reversed(items)  # más reciente primero en la lista
    ]

    return {
        "customer_id":               customer_id,
        "org_id":                    org_id,
        "found":                     True,
        "total_interactions":        len(items),
        "first_seen":                items[0].get("timestamp"),
        "last_seen":                 items[-1].get("timestamp"),
        "trend":                     trend,
        "predominant_classification": predominant,
        "current_classification":    current.get("nps_classification", "pasivo"),
        "current_churn_risk":        current.get("churn_risk", "medio"),
        "nps_evolution":             nps_evolution,
        "has_urgent_history":        len(urgent_items) > 0,
        "urgent_count":              len(urgent_items),
        "resolved_urgents":          resolved_urgents,
        "analyses":                  analyses,
    }


def get_customer_summary(org_id: str, customer_id: str) -> dict:
    """Devuelve solo los campos esenciales de un cliente."""
    items = _scan_customer(org_id, customer_id)
    if not items:
        return {"customer_id": customer_id, "found": False}

    items = [_normalize(i) for i in items]
    items.sort(key=lambda x: x.get("timestamp", ""))
    last  = items[-1]
    trend = _calculate_trend(items)

    return {
        "customer_id":          customer_id,
        "found":                True,
        "total_interactions":   len(items),
        "trend":                trend,
        "last_classification":  last.get("nps_classification", "pasivo"),
        "last_score":           _to_int(last.get("inferred_score", 5)),
        "has_urgent_history":   any(i.get("urgency") for i in items),
    }


def get_customer_list(org_id: str, period: str = None,
                      sort_by: str = "interactions") -> dict:
    """Devuelve lista de clientes identificables con sus métricas resumidas."""
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
        print(f"[customer_manager] Error en get_customer_list: {e}")
        return {"org_id": org_id, "period": period, "total_customers": 0, "customers": []}

    # Filtrar por período si viene
    if period:
        items = [i for i in items if i.get("timestamp", "").startswith(period)]

    # Agrupar por customer_id, excluyendo nulls y AUTO-
    groups: dict[str, list] = {}
    for item in items:
        cid = item.get("customer_id")
        if not cid or cid == "null" or str(cid).startswith("AUTO-"):
            continue
        groups.setdefault(cid, []).append(item)

    customers = []
    for cid, group in groups.items():
        group = [_normalize(i) for i in group]
        group.sort(key=lambda x: x.get("timestamp", ""))
        last = group[-1]
        trend = _calculate_trend(group)
        has_pending = any(
            i.get("urgency") and i.get("urgent_status", "pendiente") == "pendiente"
            for i in group
        )
        customers.append({
            "customer_id":          cid,
            "total_interactions":   len(group),
            "last_score":           _to_int(last.get("inferred_score", 5)),
            "last_classification":  last.get("nps_classification", "pasivo"),
            "last_churn_risk":      last.get("churn_risk", "medio"),
            "has_pending_urgent":   has_pending,
            "last_seen":            last.get("timestamp", ""),
            "trend":                trend,
        })

    # Ordenamiento
    if sort_by == "risk":
        risk_order = {"alto": 0, "medio": 1, "bajo": 2}
        customers.sort(key=lambda c: risk_order.get(c["last_churn_risk"], 1))
    elif sort_by == "score_asc":
        customers.sort(key=lambda c: c["last_score"])
    elif sort_by == "recent":
        customers.sort(key=lambda c: c["last_seen"], reverse=True)
    else:  # interactions
        customers.sort(key=lambda c: c["total_interactions"], reverse=True)

    return {
        "org_id":           org_id,
        "period":           period,
        "total_customers":  len(customers),
        "customers":        customers[:100],
    }
