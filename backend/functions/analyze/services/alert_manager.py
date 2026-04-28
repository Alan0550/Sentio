"""
Gestor de alertas — Sentio
Configuración y evaluación automática de alertas.
Usa la misma tabla DynamoDB que los análisis con type: "alert_config" / "alert_triggered".
"""

import os
import uuid
import json
import boto3
from datetime import datetime, timezone
from decimal import Decimal
from botocore.exceptions import BotoCoreError, ClientError

_dynamo     = boto3.resource("dynamodb", region_name="us-east-1")
_table_name = os.environ.get("TABLE_NAME", "sentio-analyses-dev")
_table      = _dynamo.Table(_table_name)

VALID_TYPES = {"nps_drop", "urgent_count", "aspect_negative", "churn_count"}

SEVERITY_LABELS = {
    "nps_drop":         lambda diff: "critical" if diff >= 20 else ("warning" if diff >= 10 else "info"),
    "urgent_count":     lambda n:    "critical" if n >= 10    else ("warning" if n >= 5    else "info"),
    "aspect_negative":  lambda pct:  "critical" if pct >= 80  else ("warning" if pct >= 60  else "info"),
    "churn_count":      lambda n:    "critical" if n >= 20    else ("warning" if n >= 10   else "info"),
}

TYPE_LABELS = {
    "nps_drop":        "Caída de NPS",
    "urgent_count":    "Urgentes del día",
    "aspect_negative": "Aspecto crítico",
    "churn_count":     "Churn alto",
}


def _to_python(val):
    if isinstance(val, Decimal):
        return int(val) if val % 1 == 0 else float(val)
    return val


def _normalize_config(item: dict) -> dict:
    item["threshold"]  = _to_python(item.get("threshold", 0))
    item["enabled"]    = bool(item.get("enabled", True))
    return item


def _normalize_triggered(item: dict) -> dict:
    item["read"] = bool(item.get("read", False))
    return item


# ── Configuraciones ───────────────────────────────────────────────────────────

def get_alert_configs(org_id: str) -> list:
    try:
        Attr  = boto3.dynamodb.conditions.Attr
        resp  = _table.scan(
            FilterExpression=Attr("org_id").eq(org_id) & Attr("type").eq("alert_config")
        )
        items = resp.get("Items", [])
        while "LastEvaluatedKey" in resp:
            resp   = _table.scan(
                FilterExpression=Attr("org_id").eq(org_id) & Attr("type").eq("alert_config"),
                ExclusiveStartKey=resp["LastEvaluatedKey"]
            )
            items += resp.get("Items", [])
        return [_normalize_config(i) for i in items]
    except (BotoCoreError, ClientError) as e:
        print(f"[alert_manager] Error get_alert_configs: {e}")
        return []


def save_alert_config(org_id: str, alert_type: str, threshold: float,
                      aspect_name: str = None) -> dict:
    if alert_type not in VALID_TYPES:
        return {"error": f"Tipo inválido. Opciones: {', '.join(VALID_TYPES)}"}
    if threshold <= 0:
        return {"error": "El threshold debe ser un número positivo"}
    if alert_type == "aspect_negative" and not aspect_name:
        return {"error": "aspect_name es requerido para alertas de tipo aspect_negative"}

    # Verificar duplicados
    existing = get_alert_configs(org_id)
    for cfg in existing:
        if cfg.get("alert_type") == alert_type:
            if alert_type == "aspect_negative":
                if cfg.get("aspect_name", "").lower() == (aspect_name or "").lower():
                    # Actualizar threshold
                    _table.update_item(
                        Key={"id": cfg["id"], "timestamp": cfg["timestamp"]},
                        UpdateExpression="SET threshold = :t",
                        ExpressionAttributeValues={":t": Decimal(str(threshold))},
                    )
                    cfg["threshold"] = threshold
                    return cfg
            else:
                _table.update_item(
                    Key={"id": cfg["id"], "timestamp": cfg["timestamp"]},
                    UpdateExpression="SET threshold = :t",
                    ExpressionAttributeValues={":t": Decimal(str(threshold))},
                )
                cfg["threshold"] = threshold
                return cfg

    now = datetime.now(timezone.utc).isoformat()
    label = TYPE_LABELS.get(alert_type, alert_type)
    if alert_type == "aspect_negative" and aspect_name:
        label = f"{label}: {aspect_name} > {threshold}%"
    else:
        label = f"{label} > {threshold}"

    item = {
        "id":          str(uuid.uuid4()),
        "timestamp":   now,
        "type":        "alert_config",
        "org_id":      org_id,
        "alert_type":  alert_type,
        "threshold":   Decimal(str(threshold)),
        "aspect_name": aspect_name or "",
        "enabled":     True,
        "created_at":  now,
        "label":       label,
    }
    try:
        _table.put_item(Item=item)
        return _normalize_config(item)
    except (BotoCoreError, ClientError) as e:
        return {"error": str(e)}


def delete_alert_config(org_id: str, config_id: str) -> bool:
    try:
        Attr = boto3.dynamodb.conditions.Attr
        resp = _table.scan(
            FilterExpression=Attr("id").eq(config_id) & Attr("type").eq("alert_config")
        )
        items = resp.get("Items", [])
        if not items:
            return False
        item = items[0]
        if item.get("org_id") != org_id:
            return False
        _table.delete_item(Key={"id": item["id"], "timestamp": item["timestamp"]})
        return True
    except (BotoCoreError, ClientError) as e:
        print(f"[alert_manager] Error delete_alert_config: {e}")
        return False


# ── Alertas disparadas ────────────────────────────────────────────────────────

def get_triggered_alerts(org_id: str, unread_only: bool = False) -> list:
    try:
        Attr  = boto3.dynamodb.conditions.Attr
        fexpr = Attr("org_id").eq(org_id) & Attr("type").eq("alert_triggered")
        if unread_only:
            fexpr = fexpr & Attr("read").eq(False)
        resp  = _table.scan(FilterExpression=fexpr)
        items = resp.get("Items", [])
        while "LastEvaluatedKey" in resp:
            resp   = _table.scan(FilterExpression=fexpr,
                                 ExclusiveStartKey=resp["LastEvaluatedKey"])
            items += resp.get("Items", [])
        items.sort(key=lambda x: x.get("triggered_at", ""), reverse=True)
        return [_normalize_triggered(i) for i in items[:50]]
    except (BotoCoreError, ClientError) as e:
        print(f"[alert_manager] Error get_triggered_alerts: {e}")
        return []


def mark_alert_read(org_id: str, alert_id: str) -> bool:
    try:
        Attr = boto3.dynamodb.conditions.Attr
        resp = _table.scan(
            FilterExpression=Attr("id").eq(alert_id) & Attr("type").eq("alert_triggered")
        )
        items = resp.get("Items", [])
        if not items:
            return False
        item = items[0]
        if item.get("org_id") != org_id:
            return False
        now = datetime.now(timezone.utc).isoformat()
        _table.update_item(
            Key={"id": item["id"], "timestamp": item["timestamp"]},
            UpdateExpression="SET #r = :r, read_at = :ra",
            ExpressionAttributeNames={"#r": "read"},
            ExpressionAttributeValues={":r": True, ":ra": now},
        )
        return True
    except (BotoCoreError, ClientError) as e:
        print(f"[alert_manager] Error mark_alert_read: {e}")
        return False


def mark_all_alerts_read(org_id: str) -> int:
    alerts = get_triggered_alerts(org_id, unread_only=True)
    count  = 0
    for a in alerts:
        if mark_alert_read(org_id, a["id"]):
            count += 1
    return count


# ── Evaluación automática ─────────────────────────────────────────────────────

def evaluate_alerts(org_id: str, period: str, current_metrics: dict) -> list:
    """Evalúa todas las configs activas y dispara las que correspondan."""
    configs   = get_alert_configs(org_id)
    triggered = []

    for cfg in configs:
        if not cfg.get("enabled", True):
            continue
        atype  = cfg.get("alert_type", "")
        thresh = float(cfg.get("threshold", 0))
        cid    = cfg.get("id", "")

        # Evitar duplicados en el mismo período
        Attr = boto3.dynamodb.conditions.Attr
        try:
            dup = _table.scan(
                FilterExpression=(
                    Attr("config_id").eq(cid) &
                    Attr("period").eq(period) &
                    Attr("type").eq("alert_triggered")
                )
            )
            if dup.get("Items"):
                continue
        except Exception:
            pass

        message  = None
        severity = "info"

        nps      = current_metrics.get("nps_score")
        prev_nps = current_metrics.get("previous_nps_score")
        urgents  = current_metrics.get("urgent_count_today", 0)
        churn    = current_metrics.get("high_churn_count", 0)
        aspects  = current_metrics.get("aspects", [])

        if atype == "nps_drop" and nps is not None and prev_nps is not None:
            diff = prev_nps - nps
            if diff >= thresh:
                message  = f"El NPS bajó {diff} puntos vs el mes anterior ({nps} vs {prev_nps})"
                severity = SEVERITY_LABELS["nps_drop"](diff)

        elif atype == "urgent_count" and urgents >= thresh:
            message  = f"Se registraron {urgents} casos urgentes hoy"
            severity = SEVERITY_LABELS["urgent_count"](urgents)

        elif atype == "aspect_negative":
            asp_name = cfg.get("aspect_name", "").lower()
            for asp in aspects:
                if asp.get("aspect", "").lower() == asp_name:
                    neg_pct = asp.get("negative_pct", 0)
                    if neg_pct >= thresh:
                        total = asp.get("total_mentions", 0)
                        message = (f"El aspecto '{asp.get('aspect')}' alcanzó "
                                   f"{neg_pct}% de negatividad ({total} menciones)")
                        severity = SEVERITY_LABELS["aspect_negative"](neg_pct)
                    break

        elif atype == "churn_count" and churn >= thresh:
            message  = f"Se registraron {churn} clientes con churn alto en el período"
            severity = SEVERITY_LABELS["churn_count"](churn)

        if not message:
            continue

        now  = datetime.now(timezone.utc).isoformat()
        item = {
            "id":           str(uuid.uuid4()),
            "timestamp":    now,
            "type":         "alert_triggered",
            "org_id":       org_id,
            "config_id":    cid,
            "alert_type":   atype,
            "message":      message,
            "severity":     severity,
            "triggered_at": now,
            "period":       period,
            "read":         False,
            "read_at":      "",
        }
        try:
            _table.put_item(Item=item)
            triggered.append(item)
            print(f"[alert_manager] Alerta disparada: {severity} — {message}")
        except Exception as e:
            print(f"[alert_manager] Error al guardar alerta: {e}")

    return triggered
