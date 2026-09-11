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


def _build_finbank_agents(twin_registry: Optional[Dict[str, CyberDigitalTwin]] = None) -> Dict[str, Agent]:
    """
    Canonical adversary agents used in all simulations and demos.
    Dynamically absorbs identities across all loaded scenarios (FinBank, Easy, Medium, Hard, Medicare).
    """
    ext_creds = {
        "creds:id-user-admin",
        "creds:id-admin-cloud",
        "creds:id-cloud-sec",
        "creds:id-admin-domain",
        "creds:id-user-dev",
        "creds:id-user-customer",
        "creds:id-sre-lead",
        "creds:id-sec-ops",
        "creds:id-user-patient",
        "creds:id-user-doctor",
        "creds:id-admin-biomed",
        "creds:who",
    }
    insider_creds = {
        "creds:id-user-admin",
        "creds:id-admin-cloud",
        "creds:id-cloud-sec",
        "creds:id-admin-domain",
        "creds:id-user-dev",
        "creds:id-user-analyst",
        "creds:id-sre-lead",
        "creds:id-sec-ops",
        "creds:id-trader-fx",
        "creds:id-user-doctor",
        "creds:id-admin-biomed",
        "creds:who",
    }

    if twin_registry:
        for dt in twin_registry.values():
            for ident in dt.twin.identities:
                ext_creds.add(f"creds:{ident.id}")
                insider_creds.add(f"creds:{ident.id}")

    return {
        "agent-external": Agent(
            id="agent-external",
            name="External Threat Actor",
            start_zones=("dmz",),
            capabilities=frozenset(ext_creds),
            objective="specific_target",
            noise_budget=1.0,
            skill=0.7,
        ),
        "agent-insider": Agent(
            id="agent-insider",
            name="Malicious Insider (Corp)",
            start_zones=("corp",),
            capabilities=frozenset(insider_creds),
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
    # Load all scenarios in backend/data/scenarios/
    twin_registry: Dict[str, CyberDigitalTwin] = {}
    golden_twin: Optional[CyberDigitalTwin] = None
    scenarios_dir = Path(__file__).parent.parent / "data" / "scenarios"
    for scenario_path in sorted(scenarios_dir.glob("*.json")):
        if scenario_path.name == "benchmarks.json":
            continue
        try:
            dt = CyberDigitalTwin.from_file(scenario_path)
            twin_registry[dt.id] = dt
            if scenario_path.name == "golden.json":
                golden_twin = dt
            logger.info(
                "Scenario loaded: id=%s (%s) assets=%d edges=%d",
                dt.id, scenario_path.name, dt.asset_count, dt.edge_count
            )
        except Exception as exc:
            logger.error("Failed to load scenario %s: %s", scenario_path.name, exc)

    if golden_twin is None and twin_registry:
        golden_twin = next(iter(twin_registry.values()))

    agent_registry = _build_finbank_agents(twin_registry)
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
    app.include_router(router, prefix="/api")

    # Mount compiled production frontend if dist directory exists
    from fastapi.staticfiles import StaticFiles
    dist_dir = Path(__file__).parent.parent.parent / "dashboard" / "dist"
    if dist_dir.is_dir():
        app.mount("/", StaticFiles(directory=str(dist_dir), html=True), name="frontend")

    return app


# Module-level app instance for uvicorn
app = create_app()
