"""
API router for portfolio management endpoints.
"""
from fastapi import APIRouter, HTTPException

from modules.portfolio import portfolio_manager
from database.models import (
    SavePortfolioRequest,
    PortfolioListResponse,
    PortfolioListItem,
    PortfolioConfig,
)

router = APIRouter(prefix="/portfolios", tags=["portfolios"])


@router.get("", response_model=PortfolioListResponse)
async def list_portfolios():
    """
    List all saved portfolio configurations.
    """
    portfolios = portfolio_manager.list_portfolios()
    return PortfolioListResponse(
        portfolios=[
            PortfolioListItem(
                name=p["name"],
                created_at=p["created_at"],
            )
            for p in portfolios
        ]
    )


@router.post("")
async def save_portfolio(request: SavePortfolioRequest):
    """
    Save a portfolio configuration.
    
    If a portfolio with the same name exists, it will be updated.
    """
    # Validate weights in config
    if not portfolio_manager.validate_weights(request.config.weights, tolerance=0.01):
        request.config.weights = portfolio_manager.normalize_weights(request.config.weights)
    
    # Convert Pydantic model to dict for storage
    config_dict = request.config.model_dump(mode="json")
    
    result = portfolio_manager.save_portfolio_config(request.name, config_dict)
    return result


@router.get("/{name}")
async def get_portfolio(name: str):
    """
    Load a saved portfolio configuration.
    """
    config = portfolio_manager.load_portfolio_config(name)
    
    if config is None:
        raise HTTPException(
            status_code=404,
            detail=f"Portfolio '{name}' not found"
        )
    
    return {"name": name, "config": config}


@router.delete("/{name}")
async def delete_portfolio(name: str):
    """
    Delete a saved portfolio.
    """
    result = portfolio_manager.delete_portfolio(name)
    
    if result["status"] == "not_found":
        raise HTTPException(
            status_code=404,
            detail=f"Portfolio '{name}' not found"
        )
    
    return result


@router.post("/equal-weight")
async def create_equal_weight(tickers: list[str]):
    """
    Generate equal-weight allocation for given tickers.
    """
    if not tickers:
        raise HTTPException(
            status_code=400,
            detail="At least one ticker must be provided"
        )
    
    weights = portfolio_manager.create_equal_weight_portfolio(tickers)
    return {"tickers": tickers, "weights": weights}


@router.post("/validate-weights")
async def validate_weights(weights: dict[str, float]):
    """
    Validate that weights sum to 1.0.
    """
    is_valid = portfolio_manager.validate_weights(weights)
    normalized = portfolio_manager.normalize_weights(weights)
    
    return {
        "is_valid": is_valid,
        "original_sum": sum(weights.values()),
        "normalized_weights": normalized,
    }

