"""
Gestor de urgentes — Sentio
Maneja el estado, asignación y seguimiento de casos urgentes.
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


def _normalize(item: dict) -> dict:
    """Normaliza un ítem de DynamoDB: parsea JSON, resuelve nulls, calcula resolution_time."""
    if isinstance(item.get("aspects"), str):
        try:
            item["aspects"] = json.loads(item["aspects"])
        except Exception:
            item["aspects"] = []

    for field in ("customer_id", "urgency_reason", "urgent_assignee",
                  "urgent_note", "urgent_updated_at", "urgent_resolved_at"):
        if item.get(field) == "null":
            item[field] = None

    # Valores por defecto para campos de gestión
    item.setdefault("urgent_status",      "pendiente")
    item.setdefault("urgent_assignee",    None)
    item.setdefault("urgent_note",        None)
    item.setdefault("urgent_updated_at",  None)
    item.setdefault("urgent_resolved_at", None)

    # Calcular resolution_time_hours
    item["resolution_time_hours"] = None
    if (item.get("urgent_status") == "resuelto"
            and item.get("urgent_resolved_at")
            and item.get("timestamp")):
        try:
            det = datetime.fromisoformat(item["timestamp"].replace("Z", "+00:00"))
            res = datetime.fromisoformat(item["urgent_resolved_at"].replace("Z", "+00:00"))
            item["resolution_time_hours"] = round((res - det).total_seconds() / 3600, 1)
        except Exception:
            pass

    # input_preview siempre truncado a 200
    if not item.get("input_preview"):
        item["input_preview"] = (item.get("input") or "")[:200]

    return item


def get_all_urgents(org_id: str, period: str = None, status: str = None) -> list:
    """Devuelve todos los análisis urgentes filtrados por org_id, período y/o estado."""
    try:
        Attr = boto3.dynamodb.conditions.Attr
        fexpr = (
            Attr("urgency").eq(True) &
            Attr("org_id").eq(org_id) &
            Attr("type").not_exists()
        )
        resp  = _table.scan(FilterExpression=fexpr)
        items = resp.get("Items", [])
        while "LastEvaluatedKey" in resp:
            resp   = _table.scan(FilterExpression=fexpr,
                                 ExclusiveStartKey=resp["LastEvaluatedKey"])
            items += resp.get("Items", [])

        if period:
            items = [i for i in items if i.get("timestamp", "").startswith(period)]

        items = [_normalize(i) for i in items]

        if status:
            items = [i for i in items
                     if i.get("urgent_status", "pendiente") == status]

        items.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        return items

    except (BotoCoreError, ClientError) as e:
        print(f"[urgent_manager] Error en get_all_urgents: {e}")
        return []


def update_urgent(analysis_id: str, org_id: str, updates: dict) -> dict:
    """
    Actualiza el estado de gestión de un urgente.
    Devuelve dict con 'success'+'analysis' o 'error'+'message'.
    """
    try:
        # Buscar por id para obtener el timestamp (RANGE key necesario para UpdateItem)
        resp  = _table.scan(
            FilterExpression=boto3.dynamodb.conditions.Attr("id").eq(analysis_id)
        )
        items = resp.get("Items", [])
        if not items:
            return {"error": "not_found", "message": "Análisis no encontrado"}

        item = items[0]

        if item.get("org_id") != org_id:
            return {"error": "forbidden",
                    "message": "No tiene permiso para modificar este análisis"}

        if not item.get("urgency"):
            return {"error": "bad_request",
                    "message": "El análisis no es urgente"}

        timestamp  = item["timestamp"]
        now        = datetime.now(timezone.utc).isoformat()
        old_status = item.get("urgent_status", "pendiente")
        new_status = updates.get("urgent_status", old_status)

        ALLOWED = {"urgent_status", "urgent_assignee", "urgent_note"}
        valid   = {k: v for k, v in updates.items() if k in ALLOWED}
        if not valid:
            return {"error": "bad_request",
                    "message": "No hay campos válidos para actualizar"}

        # Construir UpdateExpression
        set_parts  = []
        attr_names = {}
        attr_vals  = {":now": now}

        # Siempre actualizar urgent_updated_at
        set_parts.append("#uat = :now")
        attr_names["#uat"] = "urgent_updated_at"

        for idx, (k, v) in enumerate(valid.items()):
            name_ph = f"#f{idx}"
            val_ph  = f":v{idx}"
            attr_names[name_ph] = k
            attr_vals[val_ph]   = v if v is not None else "null"
            set_parts.append(f"{name_ph} = {val_ph}")

        # Manejar urgent_resolved_at
        if new_status == "resuelto" and old_status != "resuelto":
            attr_names["#rat"]  = "urgent_resolved_at"
            attr_vals[":rat"]   = now
            set_parts.append("#rat = :rat")
        elif new_status != "resuelto" and old_status == "resuelto":
            attr_names["#rat"]  = "urgent_resolved_at"
            attr_vals[":rnull"] = "null"
            set_parts.append("#rat = :rnull")

        update_expr = "SET " + ", ".join(set_parts)

        _table.update_item(
            Key={"id": analysis_id, "timestamp": timestamp},
            UpdateExpression=update_expr,
            ExpressionAttributeNames=attr_names,
            ExpressionAttributeValues=attr_vals,
        )

        # Leer el ítem actualizado
        resp2   = _table.get_item(Key={"id": analysis_id, "timestamp": timestamp})
        updated = _normalize(resp2.get("Item", item))
        print(f"[urgent_manager] {analysis_id} → {new_status}")
        return {"success": True, "analysis": updated}

    except (BotoCoreError, ClientError) as e:
        print(f"[urgent_manager] Error en update_urgent: {e}")
        return {"error": "dynamodb_error", "message": str(e)}


def get_resolution_metrics(org_id: str, period: str) -> dict:
    """Calcula métricas de resolución de urgentes para un período."""
    items    = get_all_urgents(org_id, period=period)
    total    = len(items)
    pending  = sum(1 for i in items if i.get("urgent_status", "pendiente") == "pendiente")
    in_prog  = sum(1 for i in items if i.get("urgent_status") == "en_gestion")
    resolved = sum(1 for i in items if i.get("urgent_status") == "resuelto")

    rate          = round((resolved / total) * 100, 1) if total > 0 else 0
    hours_list    = [float(i["resolution_time_hours"])
                     for i in items
                     if i.get("urgent_status") == "resuelto"
                     and i.get("resolution_time_hours") is not None]

    avg_h     = round(sum(hours_list) / len(hours_list), 1) if hours_list else None
    fastest_h = round(min(hours_list), 1) if hours_list else None
    slowest_h = round(max(hours_list), 1) if hours_list else None

    resolved_details = [
        {
            "id":                    i.get("id"),
            "customer_id":           i.get("customer_id"),
            "resolution_time_hours": i.get("resolution_time_hours"),
            "urgent_assignee":       i.get("urgent_assignee"),
            "urgent_note":           i.get("urgent_note"),
        }
        for i in items
        if i.get("urgent_status") == "resuelto"
        and i.get("resolution_time_hours") is not None
    ]

    return {
        "period":                   period,
        "total_urgent":             total,
        "pending":                  pending,
        "in_progress":              in_prog,
        "resolved":                 resolved,
        "resolution_rate_pct":      rate,
        "avg_resolution_hours":     avg_h,
        "fastest_resolution_hours": fastest_h,
        "slowest_resolution_hours": slowest_h,
        "resolved_this_period":     resolved_details,
    }
