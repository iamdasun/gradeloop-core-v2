from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends

from cipas.core.config import Settings, get_settings

router = APIRouter(tags=["health"])


@router.get("/health", summary="Service health check", response_model=dict)
async def health(
    settings: Settings = Depends(get_settings),
) -> Dict[str, Any]:
    """
    Minimal health endpoint for CIPAS service.
    """
    return {
        "status": "ok",
        "service": "cipas",
    }
