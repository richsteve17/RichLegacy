"""FastAPI entrypoint."""
from __future__ import annotations

import re

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import analysis, uploads


def create_app() -> FastAPI:
    app = FastAPI(
        title="Drum Pad Learning API",
        version="0.1.0",
        description="Local audio analysis backend for the drum learning app.",
    )

    # CORS — explicit origins + optional LAN regex (e.g. iPhone on same Wi-Fi)
    origin_regex = None
    if settings.cors_allow_lan:
        # 192.168.x.x, 10.x.x.x, 172.16-31.x.x on any port
        origin_regex = (
            r"^http://("
            r"localhost|127\.0\.0\.1|"
            r"10(\.\d{1,3}){3}|"
            r"192\.168(\.\d{1,3}){2}|"
            r"172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2}"
            r")(:\d+)?$"
        )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(uploads.router, prefix="/api", tags=["uploads"])
    app.include_router(analysis.router, prefix="/api", tags=["analysis"])

    @app.get("/health", tags=["meta"])
    def health() -> dict:
        return {"status": "ok"}

    return app


app = create_app()
