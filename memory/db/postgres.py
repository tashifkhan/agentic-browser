from __future__ import annotations
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession, AsyncEngine,
    async_sessionmaker, create_async_engine,
)

from core.config import get_settings
from memory.models.orm import Base


engine: AsyncEngine = create_async_engine(
    get_settings().postgres_dsn,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    echo=False,
)

AsyncSessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


@asynccontextmanager
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """Create tables that don't exist yet (idempotent — safe to call on startup)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
