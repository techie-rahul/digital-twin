"""FastAPI Server for FinBank Cyber Digital Twin & Change Sandbox."""

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from server.routes import router, get_golden_twin

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Preload and precompute golden scenario
    print("[INIT] Initializing FinBank Cyber Digital Twin Engine...")
    twin = get_golden_twin()
    print(f"[READY] Digital Twin loaded: {twin.id} with {len(twin.assets)} assets, {len(twin.flows)} flows.")
    yield
    print("[SHUTDOWN] Shutting down Digital Twin Server.")

app = FastAPI(
    title="FinBank Cyber Digital Twin & Security Change Sandbox",
    description="Multi-agent simulation and business service flow decision engine for HackX 4.0",
    version="2.1.0",
    lifespan=lifespan,
)

# Enable CORS for local frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "digital-twin-engine", "version": "2.1.0"}

# Mount compiled production frontend if dist directory exists
dist_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dashboard", "dist")
if os.path.isdir(dist_dir):
    app.mount("/", StaticFiles(directory=dist_dir, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server.app:app", host="127.0.0.1", port=8000, reload=True)
