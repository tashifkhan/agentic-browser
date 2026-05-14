#!/usr/bin/env python3
"""
Generate and backfill titles for stored conversations.

Usage:
    python scripts/backfill_conversation_titles.py --dry-run
    python scripts/backfill_conversation_titles.py
    python scripts/backfill_conversation_titles.py --only-default
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

from sqlalchemy import select  # noqa: E402

from core.db import engine, get_session, init_db  # noqa: E402
from models.db.app import Conversation, ConversationMessage  # noqa: E402
from services.conversations import DEFAULT_USER_ID, generate_chat_title  # noqa: E402


def _preview(text: str, max_len: int = 80) -> str:
    compact = " ".join(text.split())
    return compact[:max_len] + ("..." if len(compact) > max_len else "")


async def _first_user_message(conversation_id: str) -> str | None:
    async with get_session() as session:
        return (
            await session.execute(
                select(ConversationMessage.content)
                .where(
                    ConversationMessage.conversation_id == conversation_id,
                    ConversationMessage.role == "user",
                )
                .order_by(ConversationMessage.created_at.asc())
                .limit(1)
            )
        ).scalar_one_or_none()


async def backfill_titles(
    *,
    user_id: str | None,
    only_default: bool,
    limit: int | None,
    dry_run: bool,
) -> None:
    await init_db()

    query = select(Conversation).order_by(Conversation.created_at.asc())
    if user_id:
        query = query.where(Conversation.user_id == user_id)
    if only_default:
        query = query.where(Conversation.title == "New Conversation")
    if limit:
        query = query.limit(limit)

    async with get_session() as session:
        conversations = (await session.execute(query)).scalars().all()

    updated = 0
    unchanged = 0
    skipped = 0

    for conv in conversations:
        first_message = await _first_user_message(conv.conversation_id)
        if not first_message:
            skipped += 1
            print(f"SKIP  {conv.conversation_id}: no user message")
            continue

        title = await generate_chat_title(first_message)
        if title == conv.title:
            unchanged += 1
            print(f"SAME  {conv.conversation_id}: {title!r}")
            continue

        print(
            f"TITLE {conv.conversation_id}: {conv.title!r} -> {title!r} "
            f"from {_preview(first_message)!r}"
        )
        if not dry_run:
            async with get_session() as session:
                row = (
                    await session.execute(
                        select(Conversation).where(
                            Conversation.conversation_id == conv.conversation_id
                        )
                    )
                ).scalar_one_or_none()
                if row:
                    row.title = title
        updated += 1

    mode = "dry-run" if dry_run else "committed"
    print(
        f"\nDone ({mode}): {updated} updated, {unchanged} unchanged, "
        f"{skipped} skipped, {len(conversations)} scanned."
    )

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill conversation titles using CHAT_TITLE_LLM_* settings."
    )
    parser.add_argument(
        "--user-id",
        default="all",
        help=f"User ID to backfill, or 'all' for every user (default: all). Use {DEFAULT_USER_ID!r} for the default user only.",
    )
    parser.add_argument(
        "--only-default",
        action="store_true",
        help="Only update conversations still titled 'New Conversation'.",
    )
    parser.add_argument("--limit", type=int, default=None, help="Maximum conversations to scan.")
    parser.add_argument("--dry-run", action="store_true", help="Generate titles without writing them.")
    args = parser.parse_args()

    user_id = None if args.user_id == "all" else args.user_id
    asyncio.run(
        backfill_titles(
            user_id=user_id,
            only_default=args.only_default,
            limit=args.limit,
            dry_run=args.dry_run,
        )
    )


if __name__ == "__main__":
    main()
