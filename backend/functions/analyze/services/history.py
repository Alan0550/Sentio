"""
Historial de análisis — Amazon DynamoDB.
Guarda y consulta los análisis de feedback de Sentio.
"""

import os
import uuid
import json
import boto3
from datetime import datetime, timezone
from botocore.exceptions import BotoCoreError, ClientError

_dynamo     = boto3.resource("dynamodb", region_name="us-east-1")
_table_name = os.environ.get("TABLE_NAME", "sentio-analyses-dev")
_table      = _dynamo.Table(_table_name)


def save_analysis(user_input: str, result: dict) -> str:
    """Guarda un análisis en DynamoDB. Retorna el ID generado."""
    analysis_id = str(uuid.uuid4())
    timestamp   = datetime.now(timezone.utc).isoformat()

    # Serializar objetos anidados como JSON strings para DynamoDB
    sentiment_breakdown = result.get("sentiment_breakdown", {})
    aspects             = result.get("aspects", [])

    item = {
        "id":               analysis_id,
        "org_id":           result.get("org_id", "default"),
        "timestamp":        timestamp,
        "input_preview":    user_input[:300],
        "source":           result.get("source", "manual"),
        "customer_id":      result.get("customer_id") or "null",
        "nps_classification": result.get("nps_classification", "pasivo"),
        "inferred_score":   result.get("inferred_score", 5),
        "overall_sentiment": result.get("overall_sentiment", "neutro"),
        "sentiment_breakdown": json.dumps(sentiment_breakdown, ensure_ascii=False),
        "aspects":          json.dumps(aspects, ensure_ascii=False),
        "dominant_emotion": result.get("dominant_emotion", "indiferencia"),
        "churn_risk":       result.get("churn_risk", "medio"),
        "urgency":          bool(result.get("urgency", False)),
        "urgency_reason":   result.get("urgency_reason") or "null",
        "industry":         result.get("industry", "general"),
        "summary":          result.get("summary", ""),
        "recommended_action": result.get("recommended_action", ""),
    }

    try:
        _table.put_item(Item=item)
        print(f"[history] Guardado en DynamoDB — id={analysis_id} org={item['org_id']}")
        return analysis_id
    except (BotoCoreError, ClientError) as e:
        print(f"[history] Error al guardar en DynamoDB: {e}")
        return analysis_id


def get_recent(limit: int = 20, org_id: str = None) -> list:
    """Retorna los últimos análisis guardados, opcionalmente filtrados por org_id."""
    try:
        if org_id and org_id != "default":
            response = _table.scan(
                FilterExpression=boto3.dynamodb.conditions.Attr("org_id").eq(org_id),
                Limit=limit * 3,  # pedir más para compensar el filtro
            )
        else:
            response = _table.scan(Limit=limit * 2)

        items = response.get("Items", [])

        for item in items:
            if isinstance(item.get("sentiment_breakdown"), str):
                try:
                    item["sentiment_breakdown"] = json.loads(item["sentiment_breakdown"])
                except (json.JSONDecodeError, TypeError):
                    item["sentiment_breakdown"] = {}
            if isinstance(item.get("aspects"), str):
                try:
                    item["aspects"] = json.loads(item["aspects"])
                except (json.JSONDecodeError, TypeError):
                    item["aspects"] = []
            # Normalizar customer_id y urgency_reason
            if item.get("customer_id") == "null":
                item["customer_id"] = None
            if item.get("urgency_reason") == "null":
                item["urgency_reason"] = None

        # Excluir batch_summary — son resúmenes, no análisis individuales
        items = [i for i in items if i.get("type") != "batch_summary"]

        sorted_items = sorted(items, key=lambda x: x.get("timestamp", ""), reverse=True)
        return sorted_items[:limit]

    except (BotoCoreError, ClientError) as e:
        print(f"[history] Error al consultar DynamoDB: {e}")
        return []


def get_analyses_by_period(org_id: str, period: str) -> list:
    """Devuelve todos los análisis individuales de un org_id y período (YYYY-MM)."""
    try:
        Attr = boto3.dynamodb.conditions.Attr
        filter_expr = (
            Attr("org_id").eq(org_id) &
            Attr("timestamp").begins_with(period) &
            Attr("type").not_exists()          # excluye batch_summary
        )
        response = _table.scan(FilterExpression=filter_expr)
        items    = response.get("Items", [])

        # Paginar si hay más ítems
        while "LastEvaluatedKey" in response:
            response = _table.scan(
                FilterExpression=filter_expr,
                ExclusiveStartKey=response["LastEvaluatedKey"],
            )
            items.extend(response.get("Items", []))

        for item in items:
            if isinstance(item.get("aspects"), str):
                try:
                    item["aspects"] = json.loads(item["aspects"])
                except (json.JSONDecodeError, TypeError):
                    item["aspects"] = []

        return items

    except (BotoCoreError, ClientError) as e:
        print(f"[history] Error en get_analyses_by_period: {e}")
        return []


def save_batch_summary(batch_id: str, org_id: str, summary_data: dict) -> str:
    """Guarda el resumen de un batch como ítem separado en DynamoDB."""
    timestamp = datetime.now(timezone.utc).isoformat()
    item = {
        "id":        batch_id,
        "timestamp": timestamp,
        "type":      "batch_summary",
        "org_id":    org_id,
        "total":     summary_data.get("total", 0),
        "processed": summary_data.get("processed", 0),
        "failed":    summary_data.get("failed", 0),
        "summary":   json.dumps(summary_data.get("summary", {}), ensure_ascii=False),
        "status":    "completed",
    }
    try:
        _table.put_item(Item=item)
        print(f"[history] Batch summary guardado — batch_id={batch_id} org={org_id}")
    except (BotoCoreError, ClientError) as e:
        print(f"[history] Error al guardar batch summary: {e}")
    return batch_id


def get_batch_summary(batch_id: str) -> dict | None:
    """Recupera el resumen de un batch. Retorna None si no existe."""
    try:
        response = _table.scan(
            FilterExpression=(
                boto3.dynamodb.conditions.Attr("id").eq(batch_id) &
                boto3.dynamodb.conditions.Attr("type").eq("batch_summary")
            )
        )
        items = response.get("Items", [])
        if not items:
            return None
        item = items[0]
        if isinstance(item.get("summary"), str):
            try:
                item["summary"] = json.loads(item["summary"])
            except (json.JSONDecodeError, TypeError):
                item["summary"] = {}
        return item
    except (BotoCoreError, ClientError) as e:
        print(f"[history] Error al consultar batch summary: {e}")
        return None
