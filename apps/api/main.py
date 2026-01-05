from __future__ import annotations

import logging
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from sindhai_api.infrastructure.config import load_settings
from sindhai_api.interface.api.routes import router as api_router

def create_app() -> FastAPI:
    app = FastAPI(title="Sindhai API", version="0.0.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    settings = load_settings()
    logger = logging.getLogger("sindhai.api")

    @app.middleware("http")
    async def request_id_and_logging(request: Request, call_next):
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        request.state.request_id = request_id
        start = time.perf_counter()

        if settings.api_auth_mode == "bearer":
            if request.url.path != "/health":
                token = settings.api_auth_token or ""
                auth = request.headers.get("authorization") or ""
                if not token or auth != f"Bearer {token}":
                    return JSONResponse(
                        status_code=401,
                        content={"detail": "unauthorized"},
                        headers={"X-Request-ID": request_id},
                    )

        try:
            response = await call_next(request)
        except Exception:
            dt_ms = (time.perf_counter() - start) * 1000.0
            logger.exception("request_error", extra={"rid": request_id, "path": request.url.path, "ms": dt_ms})
            return JSONResponse(
                status_code=500,
                content={"detail": "internal_error", "request_id": request_id},
                headers={"X-Request-ID": request_id},
            )

        dt_ms = (time.perf_counter() - start) * 1000.0
        if settings.api_debug_log:
            logger.info(
                "request",
                extra={
                    "rid": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "query": request.url.query,
                    "status": response.status_code,
                    "ms": dt_ms,
                },
            )
        else:
            logger.info(
                "request",
                extra={
                    "rid": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "status": response.status_code,
                    "ms": dt_ms,
                },
            )
        response.headers["X-Request-ID"] = request_id
        return response

    app.include_router(api_router)
    return app

app = create_app()
