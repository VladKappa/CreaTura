from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any


SERVICE_NAME = "solver"
LOGGER_NAME = "creatura.solver"


def _timestamp_utc_microseconds() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def _serialize_value(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=True)
    return json.dumps(value, ensure_ascii=True, default=str)


def format_log_line(level: str, event: str, **fields: Any) -> str:
    parts = [
        _timestamp_utc_microseconds(),
        f"service={SERVICE_NAME}",
        f"level={level.upper()}",
        f"event={event}",
    ]
    for key, value in fields.items():
        parts.append(f"{key}={_serialize_value(value)}")
    return " | ".join(parts)


def get_logger() -> logging.Logger:
    logger = logging.getLogger(LOGGER_NAME)
    if getattr(logger, "_creatura_configured", False):
        return logger

    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.handlers.clear()
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False
    logger._creatura_configured = True  # type: ignore[attr-defined]
    return logger


def log_event(logger: logging.Logger, level: str, event: str, **fields: Any) -> None:
    line = format_log_line(level=level, event=event, **fields)
    normalized = level.upper()
    if normalized in {"WARN", "WARNING"}:
        logger.warning(line)
    elif normalized == "ERROR":
        logger.error(line)
    else:
        logger.info(line)
