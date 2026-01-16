"""
FastAPI application entry point for the PortfolioExpert backend.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import API_HOST, API_PORT
from database.connection import init_db
from routers import data_router, backtest_router, portfolio_router, statistics_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup/shutdown events."""
    # Startup: Initialize database
    print("Initializing database...")
    init_db()
    print("Database ready!")
    yield
    # Shutdown: Cleanup if needed
    print("Shutting down...")


# Create FastAPI application
app = FastAPI(
    title="PortfolioExpert API",
    description="Backend API for the PortfolioExpert portfolio management app",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for local development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(data_router)
app.include_router(backtest_router)
app.include_router(portfolio_router)
app.include_router(statistics_router)


@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "name": "PortfolioExpert API",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": {
            "data": "/data",
            "backtest": "/backtest",
            "portfolios": "/portfolios",
            "statistics": "/statistics",
        },
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=API_HOST,
        port=API_PORT,
        reload=True,
    )

