from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection


async def upgrade(conn: AsyncConnection) -> None:
    await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))

    await conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS app_settings (
                id BIGSERIAL PRIMARY KEY,
                user_id TEXT NOT NULL DEFAULT 'default',
                key TEXT NOT NULL,
                value JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                CONSTRAINT uq_app_settings_user_key UNIQUE (user_id, key)
            )
            """
        )
    )
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_app_settings_user_id ON app_settings (user_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_app_settings_key ON app_settings (key)"))

    await conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS browser_sessions (
                session_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL DEFAULT 'default',
                title TEXT NOT NULL DEFAULT 'New Chat',
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb
            )
            """
        )
    )
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_browser_sessions_user_id ON browser_sessions (user_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_browser_sessions_updated_at ON browser_sessions (updated_at DESC)"))

    await conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS browser_session_messages (
                message_id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL REFERENCES browser_sessions(session_id) ON DELETE CASCADE,
                user_id TEXT NOT NULL DEFAULT 'default',
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                events JSONB NOT NULL DEFAULT '[]'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
    )
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_browser_session_messages_session_id ON browser_session_messages (session_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_browser_session_messages_user_id ON browser_session_messages (user_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_browser_session_messages_created_at ON browser_session_messages (created_at)"))

    await conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS browser_credentials (
                id BIGSERIAL PRIMARY KEY,
                user_id TEXT NOT NULL DEFAULT 'default',
                provider TEXT NOT NULL,
                account_label TEXT,
                payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                CONSTRAINT uq_browser_credentials_user_provider UNIQUE (user_id, provider)
            )
            """
        )
    )
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_browser_credentials_user_id ON browser_credentials (user_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_browser_credentials_provider ON browser_credentials (provider)"))

    await conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS browser_snapshots (
                id BIGSERIAL PRIMARY KEY,
                user_id TEXT NOT NULL DEFAULT 'default',
                kind TEXT NOT NULL,
                payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
    )
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_browser_snapshots_user_id ON browser_snapshots (user_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_browser_snapshots_kind ON browser_snapshots (kind)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_browser_snapshots_created_at ON browser_snapshots (created_at DESC)"))
