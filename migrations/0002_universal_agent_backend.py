from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection


async def upgrade(conn: AsyncConnection) -> None:
    await conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS conversations (
                conversation_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL DEFAULT 'default',
                client_id TEXT NOT NULL DEFAULT 'unknown',
                title TEXT NOT NULL DEFAULT 'New Conversation',
                summary TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
    )
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_conversations_user_id ON conversations (user_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_conversations_client_id ON conversations (client_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_conversations_status ON conversations (status)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_conversations_updated_at ON conversations (updated_at DESC)"))

    await conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS conversation_messages (
                message_id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
                user_id TEXT NOT NULL DEFAULT 'default',
                client_id TEXT NOT NULL DEFAULT 'unknown',
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
    )
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_conversation_messages_conversation_id ON conversation_messages (conversation_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_conversation_messages_user_id ON conversation_messages (user_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_conversation_messages_client_id ON conversation_messages (client_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_conversation_messages_role ON conversation_messages (role)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_conversation_messages_created_at ON conversation_messages (created_at)"))

    await conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS agent_runs (
                run_id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
                user_message_id TEXT REFERENCES conversation_messages(message_id) ON DELETE SET NULL,
                final_message_id TEXT REFERENCES conversation_messages(message_id) ON DELETE SET NULL,
                user_id TEXT NOT NULL DEFAULT 'default',
                client_id TEXT NOT NULL DEFAULT 'unknown',
                entrypoint TEXT NOT NULL DEFAULT 'react_agent',
                status TEXT NOT NULL DEFAULT 'running',
                final_answer TEXT,
                error TEXT,
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                completed_at TIMESTAMPTZ
            )
            """
        )
    )
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_agent_runs_conversation_id ON agent_runs (conversation_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_agent_runs_user_message_id ON agent_runs (user_message_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_agent_runs_final_message_id ON agent_runs (final_message_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_agent_runs_user_id ON agent_runs (user_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_agent_runs_client_id ON agent_runs (client_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_agent_runs_status ON agent_runs (status)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_agent_runs_started_at ON agent_runs (started_at DESC)"))

    await conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS subagent_runs (
                subagent_run_id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
                conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                task TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'running',
                result TEXT,
                started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                completed_at TIMESTAMPTZ
            )
            """
        )
    )
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_subagent_runs_run_id ON subagent_runs (run_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_subagent_runs_conversation_id ON subagent_runs (conversation_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_subagent_runs_name ON subagent_runs (name)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_subagent_runs_status ON subagent_runs (status)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_subagent_runs_started_at ON subagent_runs (started_at DESC)"))

    await conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS agent_events (
                event_id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
                conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
                subagent_run_id TEXT REFERENCES subagent_runs(subagent_run_id) ON DELETE SET NULL,
                event_type TEXT NOT NULL,
                payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
    )
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_agent_events_run_id ON agent_events (run_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_agent_events_conversation_id ON agent_events (conversation_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_agent_events_subagent_run_id ON agent_events (subagent_run_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_agent_events_event_type ON agent_events (event_type)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_agent_events_created_at ON agent_events (created_at)"))

    await conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS tool_calls (
                tool_call_id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
                conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
                subagent_run_id TEXT REFERENCES subagent_runs(subagent_run_id) ON DELETE SET NULL,
                tool_name TEXT NOT NULL,
                args JSONB NOT NULL DEFAULT '{}'::jsonb,
                status TEXT NOT NULL DEFAULT 'running',
                result JSONB,
                error TEXT,
                started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                completed_at TIMESTAMPTZ
            )
            """
        )
    )
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_tool_calls_run_id ON tool_calls (run_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_tool_calls_conversation_id ON tool_calls (conversation_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_tool_calls_subagent_run_id ON tool_calls (subagent_run_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_tool_calls_tool_name ON tool_calls (tool_name)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_tool_calls_status ON tool_calls (status)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_tool_calls_started_at ON tool_calls (started_at DESC)"))

    await conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS client_context_snapshots (
                context_id TEXT PRIMARY KEY,
                conversation_id TEXT REFERENCES conversations(conversation_id) ON DELETE SET NULL,
                user_id TEXT NOT NULL DEFAULT 'default',
                client_id TEXT NOT NULL DEFAULT 'unknown',
                context_type TEXT NOT NULL DEFAULT 'generic',
                payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
    )
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_client_context_snapshots_conversation_id ON client_context_snapshots (conversation_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_client_context_snapshots_user_id ON client_context_snapshots (user_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_client_context_snapshots_client_id ON client_context_snapshots (client_id)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_client_context_snapshots_context_type ON client_context_snapshots (context_type)"))
    await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_client_context_snapshots_created_at ON client_context_snapshots (created_at DESC)"))
