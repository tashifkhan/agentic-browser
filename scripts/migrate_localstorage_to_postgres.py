#!/usr/bin/env python3
"""
Migrate browser local storage chat sessions to PostgreSQL.

Usage:
    python scripts/migrate_localstorage_to_postgres.py <localstorage.json> [--user-id default] [--dry-run] [--upsert]

Input JSON format (export from browser DevTools → Application → Local Storage):
    Either a raw sessions array:
        [{"id": "...", "title": "...", "updatedAt": "...", "messages": [...]}]

    Or a full localStorage dump (object with keys):
        {"sessions": [...], "chatHistory": [...], ...}

    Or a single session object:
        {"id": "...", "title": "...", "messages": [...]}
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _parse_dt(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000 if value > 1e10 else value, tz=timezone.utc)
    if isinstance(value, str) and value:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            pass
    return datetime.now(timezone.utc)


def extract_sessions(data: Any) -> list[dict[str, Any]]:
    """Normalize various dump formats into a list of session dicts."""
    # Raw array of sessions
    if isinstance(data, list):
        return data

    # Single session object
    if isinstance(data, dict) and "messages" in data and "id" in data:
        return [data]

    # Full localStorage dump — try known keys in priority order
    if isinstance(data, dict):
        for key in ("sessions", "chatHistory"):
            val = data.get(key)
            if val is None:
                continue
            # localStorage values are JSON-stringified strings
            if isinstance(val, str):
                try:
                    val = json.loads(val)
                except json.JSONDecodeError:
                    continue
            if isinstance(val, list):
                return val

        # Legacy chatHistory format: array of messages (not sessions)
        # Wrap it as one session
        for key in ("chatHistory",):
            val = data.get(key)
            if isinstance(val, str):
                try:
                    val = json.loads(val)
                except json.JSONDecodeError:
                    continue
            if isinstance(val, list) and val and isinstance(val[0], dict) and "role" in val[0]:
                return [{
                    "id": "migrated-chat-history",
                    "title": "Migrated Chat History",
                    "updatedAt": datetime.now(timezone.utc).isoformat(),
                    "messages": val,
                }]

    raise ValueError(
        "Cannot detect sessions in the input. Expected a sessions array, a single session, "
        "or a localStorage dump with a 'sessions' key."
    )


def validate_session(raw: dict[str, Any], idx: int) -> tuple[bool, list[str]]:
    warnings: list[str] = []
    if not raw.get("id"):
        return False, [f"Session #{idx}: missing 'id', skipping"]
    if not raw.get("messages"):
        warnings.append(f"Session '{raw['id']}': no messages")
    return True, warnings


def migrate(
    sessions: list[dict[str, Any]],
    user_id: str,
    dry_run: bool,
    upsert: bool,
    pg_dsn: str,
) -> None:
    import psycopg2
    import psycopg2.extras

    # Use sync psycopg2 for a standalone script (no async runtime needed)
    sync_dsn = pg_dsn.replace("postgresql+asyncpg://", "postgresql://").replace(
        "postgresql+psycopg2://", "postgresql://"
    )

    conn = psycopg2.connect(sync_dsn)
    conn.autocommit = False
    cur = conn.cursor()

    now = datetime.now(timezone.utc)
    sessions_inserted = 0
    messages_inserted = 0
    sessions_skipped = 0

    try:
        for idx, raw in enumerate(sessions):
            ok, warnings = validate_session(raw, idx)
            for w in warnings:
                print(f"  WARN  {w}")
            if not ok:
                sessions_skipped += 1
                continue

            session_id = str(raw["id"]).strip()
            title = str(raw.get("title") or "New Chat")
            updated_at = _parse_dt(raw.get("updatedAt"))
            created_at = updated_at

            if upsert:
                session_sql = """
                    INSERT INTO browser_sessions (session_id, user_id, title, created_at, updated_at, metadata)
                    VALUES (%s, %s, %s, %s, %s, %s::jsonb)
                    ON CONFLICT (session_id) DO UPDATE
                        SET title = EXCLUDED.title,
                            updated_at = EXCLUDED.updated_at,
                            metadata = EXCLUDED.metadata
                """
            else:
                session_sql = """
                    INSERT INTO browser_sessions (session_id, user_id, title, created_at, updated_at, metadata)
                    VALUES (%s, %s, %s, %s, %s, %s::jsonb)
                    ON CONFLICT (session_id) DO NOTHING
                """

            if not dry_run:
                cur.execute(session_sql, (
                    session_id, user_id, title, created_at, updated_at, json.dumps({})
                ))

            sessions_inserted += 1

            for msg in raw.get("messages") or []:
                message_id = str(msg.get("id") or "").strip()
                if not message_id:
                    print(f"  WARN  Session '{session_id}': message missing 'id', skipping")
                    continue

                role = str(msg.get("role") or "user")
                content = str(msg.get("content") or "")
                events = list(msg.get("events") or [])
                msg_created_at = _parse_dt(msg.get("timestamp"))

                if upsert:
                    msg_sql = """
                        INSERT INTO browser_session_messages
                            (message_id, session_id, user_id, role, content, events, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s, %s)
                        ON CONFLICT (message_id) DO UPDATE
                            SET content = EXCLUDED.content,
                                events = EXCLUDED.events,
                                updated_at = EXCLUDED.updated_at
                    """
                else:
                    msg_sql = """
                        INSERT INTO browser_session_messages
                            (message_id, session_id, user_id, role, content, events, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s, %s)
                        ON CONFLICT (message_id) DO NOTHING
                    """

                if not dry_run:
                    cur.execute(msg_sql, (
                        message_id, session_id, user_id, role, content,
                        json.dumps(events), msg_created_at, now
                    ))

                messages_inserted += 1

        if not dry_run:
            conn.commit()
            print(f"\n  Committed to PostgreSQL.")
        else:
            conn.rollback()
            print(f"\n  Dry run — no changes written.")

    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()

    print(
        f"  Sessions: {sessions_inserted} processed, {sessions_skipped} skipped\n"
        f"  Messages: {messages_inserted} processed"
    )


def build_dsn(args: argparse.Namespace) -> str:
    """Load DSN from env or construct from individual POSTGRES_* vars."""
    import os
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).parent.parent / ".env")

    # Allow explicit override
    if args.dsn:
        return args.dsn

    host = os.getenv("POSTGRES_HOST", "localhost")
    port = os.getenv("POSTGRES_PORT", "5433")
    db   = os.getenv("POSTGRES_DB", "agentic_memory")
    user = os.getenv("POSTGRES_USER", "agentic")
    pw   = os.getenv("POSTGRES_PASSWORD", "agentic_secret")

    return f"postgresql://{user}:{pw}@{host}:{port}/{db}"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Migrate browser localStorage chat sessions to PostgreSQL."
    )
    parser.add_argument("input", help="Path to the JSON file exported from localStorage")
    parser.add_argument("--user-id", default="default", help="User ID to tag rows with (default: 'default')")
    parser.add_argument("--dry-run", action="store_true", help="Parse and validate without writing to DB")
    parser.add_argument("--upsert", action="store_true", help="Update existing rows instead of skipping conflicts")
    parser.add_argument("--dsn", default=None, help="PostgreSQL DSN (overrides .env POSTGRES_* vars)")
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"ERROR: File not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    raw_data = json.loads(input_path.read_text())

    try:
        sessions = extract_sessions(raw_data)
    except ValueError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"Found {len(sessions)} session(s) in {input_path.name}")
    if args.dry_run:
        print("  [DRY RUN — no DB writes]")

    dsn = build_dsn(args)

    try:
        migrate(sessions, args.user_id, args.dry_run, args.upsert, dsn)
    except Exception as e:
        print(f"\nERROR during migration: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
