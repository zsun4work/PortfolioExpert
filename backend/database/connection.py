"""
Database connection management for SQLite.
"""
import sqlite3
from pathlib import Path
from contextlib import contextmanager
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from config import DATABASE_PATH, DATABASE_URL

# Create SQLAlchemy engine
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """Dependency for FastAPI to get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_context():
    """Context manager for database session."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def get_raw_connection() -> sqlite3.Connection:
    """Get raw SQLite connection for pandas operations."""
    return sqlite3.connect(DATABASE_PATH)


def init_db():
    """Initialize database with schema."""
    schema_path = Path(__file__).parent / "schema.sql"
    
    with get_raw_connection() as conn:
        with open(schema_path, "r") as f:
            conn.executescript(f.read())
        conn.commit()
    
    print(f"Database initialized at: {DATABASE_PATH}")


if __name__ == "__main__":
    init_db()

