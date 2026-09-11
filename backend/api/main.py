"""
FastAPI application factory and lifespan for the FinBank Cyber Digital Twin API.

Startup sequence:
  1. Load golden.json → CyberDigitalTwin
  2. Register canonical FinBank agents in app.state.agent_registry
  3. Register golden twin in app.state.twin_registry
  4. Mount routes

Run:
    python -m uvicorn backend.api.main:app --reload --port 8000

Swagger UI: http://localhost:8000/docs
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.core.models import Agent
from backend.core.twin import CyberDigitalTwin

from backend.api import cache as result_cache
from backend.api.routes import router

logger = logging.getLogger("digital_twin.api")

# Canonical path to the golden FinBank scenario
GOLDEN_SCENARIO_PATH = Path(__file__).parent.parent / "data" / "scenarios" / "golden.json"


def _build_finbank_agents() -> Dict[str, Agent]:
    """
    Canonical FinBank adversary agents used in all simulations and demos.

    agent-external: unauthenticated attacker from the internet/DMZ zone.
    agent-insider:  malicious insider in the corporate zone with admin credentials.

    These match the objective/zone values meaningful for the FinBank golden scenario.
    """
    return {
        "agent-external": Agent(
            id="agent-external",
            name="External Threat Actor",
            start_zones=("dmz",),
            capabilities=frozenset(),
            objective="specific_target",
            noise_budget=1.0,
            skill=0.5,
        ),
        "agent-insider": Agent(
            id="agent-insider",
            name="Malicious Insider (Corp)",
            start_zones=("corp",),
            capabilities=frozenset(["creds:id-user-admin"]),
            objective="specific_target",
            noise_budget=1.0,
            skill=0.8,
        ),
    }


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    FastAPI lifespan context manager.
    Runs startup logic before yielding, shutdown logic on exit.
    """
    # ── STARTUP ──────────────────────────────────────────────────────────
    logger.info("Loading FinBank golden scenario from %s", GOLDEN_SCENARIO_PATH)

    twin_registry: Dict[str, CyberDigitalTwin] = {}
    golden_twin: Optional[CyberDigitalTwin] = None

    if GOLDEN_SCENARIO_PATH.exists():
        try:
            golden_twin = CyberDigitalTwin.from_file(GOLDEN_SCENARIO_PATH)
            twin_registry[golden_twin.id] = golden_twin
            logger.info(
                "Golden twin loaded: id=%s hash=%s assets=%d edges=%d",
                golden_twin.id,
                golden_twin.hash()[:16],
                golden_twin.asset_count,
                golden_twin.edge_count,
            )
        except Exception as exc:
            logger.error("Failed to load golden scenario: %s", exc)
    else:
        logger.warning("Golden scenario not found at %s", GOLDEN_SCENARIO_PATH)

    agent_registry = _build_finbank_agents()
    logger.info("Registered agents: %s", list(agent_registry.keys()))

    app.state.twin_registry = twin_registry
    app.state.agent_registry = agent_registry
    app.state.golden_twin = golden_twin

    # ── YIELD (server runs here) ──────────────────────────────────────────
    yield

    # ── SHUTDOWN ──────────────────────────────────────────────────────────
    result_cache.clear()
    logger.info("Cache cleared. Shutdown complete.")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application instance."""
    app = FastAPI(
        title="FinBank Cyber Digital Twin API",
        description=(
            "Security Digital Twin platform for threat vector assessment. "
            "Simulates adversary movement, evaluates control effectiveness, "
            "and prioritises remediation by critical-path elimination."
        ),
        version="2.1.0",
        lifespan=lifespan,
    )

    # CORS — allow the Vite dev server (localhost:5173) and any other local origins.
    # This is intentionally permissive for local hackathon development only.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:3000",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:3000",
        ],
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "Accept"],
    )

    app.include_router(router)

    # Mount compiled production frontend if dist directory exists
    from fastapi.staticfiles import StaticFiles
    dist_dir = Path(__file__).parent.parent.parent / "dashboard" / "dist"
    if dist_dir.is_dir():
        app.mount("/", StaticFiles(directory=str(dist_dir), html=True), name="frontend")

    return app


# Module-level app instance for uvicorn
app = create_app()
