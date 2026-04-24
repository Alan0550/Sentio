"""
Historial de análisis — Amazon DynamoDB.
Guarda y consulta los análisis realizados.
"""

import os
import uuid
import json
import boto3
from datetime import datetime, timezone
from botocore.exceptions import BotoCoreError, ClientError

_dynamo     = boto3.resource("dynamodb", region_name="us-east-1")
_table_name = os.environ.get("TABLE_NAME", "truthlens-analysis-dev")
_table      = _dynamo.Table(_table_name)


def save_analysis(user_input: str, result: dict) -> str:
    """Guarda un análisis en DynamoDB. Retorna el ID generado."""
    analysis_id = str(uuid.uuid4())
    timestamp   = datetime.now(timezone.utc).isoformat()

    item = {
        "id":         analysis_id,
        "timestamp":  timestamp,
        "input":      user_input[:500],
        "input_type": result.get("input_type", "text"),
        "score":      result["score"],
        "level":      result["level"],
        "explanation": result["explanation"],
        "signals":    json.dumps(result["signals"], ensure_ascii=False),
    }

    try:
        _table.put_item(Item=item)
        print(f"[history] Guardado en DynamoDB — id={analysis_id}")
        return analysis_id
    except (BotoCoreError, ClientError) as e:
        print(f"[history] Error al guardar en DynamoDB: {e}")
        return analysis_id


def get_recent(limit: int = 10) -> list:
    """Retorna los últimos análisis guardados."""
    try:
        response = _table.scan(Limit=limit)
        items    = response.get("Items", [])

        for item in items:
            if isinstance(item.get("signals"), str):
                item["signals"] = json.loads(item["signals"])

        return sorted(items, key=lambda x: x["timestamp"], reverse=True)[:limit]
    except (BotoCoreError, ClientError) as e:
        print(f"[history] Error al consultar DynamoDB: {e}")
        return []
