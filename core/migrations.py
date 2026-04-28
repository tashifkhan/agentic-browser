from __future__ import annotations

import importlib
import pkgutil

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine


MIGRATION_PACKAGE = "migrations"


def _migration_names() -> list[str]:
    package = importlib.import_module(MIGRATION_PACKAGE)
    names = []
    for module in pkgutil.iter_modules(package.__path__):
        if module.name[:4].isdigit() and not module.ispkg:
            names.append(module.name)
    return sorted(names)


async def run_migrations(engine: AsyncEngine) -> list[str]:
    """Run unapplied numbered migrations like `0001_app_state.py`.

    This intentionally stays lightweight instead of introducing Alembic. Each
    migration module exports `async def upgrade(conn)` and is tracked in the
    `schema_migrations` table.
    """
    applied_now: list[str] = []

    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    name TEXT PRIMARY KEY,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
                """
            )
        )
        result = await conn.execute(text("SELECT name FROM schema_migrations"))
        applied = {row[0] for row in result.fetchall()}

        for name in _migration_names():
            if name in applied:
                continue
            module = importlib.import_module(f"{MIGRATION_PACKAGE}.{name}")
            upgrade = getattr(module, "upgrade", None)
            if upgrade is None:
                raise RuntimeError(f"Migration {name} has no upgrade(conn) function")
            await upgrade(conn)
            await conn.execute(
                text("INSERT INTO schema_migrations (name) VALUES (:name)"),
                {"name": name},
            )
            applied_now.append(name)

    return applied_now
