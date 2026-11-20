"""Seed the local databases with a month of believable activity.

    uv run python scripts/seed_demo.py           # add demo data
    uv run python scripts/seed_demo.py --reset   # remove only what this script added

Runs go through the real RunTraceService with its clock patched, so events,
tool calls and sub-agent rows have exactly the shapes the agents write.
Memory rows are inserted directly (so their ages and usage counts look
lived-in), then mirrored into OpenSearch and Neo4j the way ingestion does.
Every id created is listed in ~/.agentic-browser/demo-seed.json, which
--reset uses, so real data is never touched.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import random
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select

import services.run_traces as traces
from core.db import get_session, init_db
from models.db.app import (
    AgentEvent,
    AgentRun,
    BrowserSession,
    BrowserSessionMessage,
    Conversation,
    ConversationMessage,
    SubagentRun,
    ToolCall,
)
from models.db.memory import ClaimORM, ClaimRelationORM, EntityORM, EvidenceORM, MaintenanceRunORM, SourceORM

MANIFEST = Path.home() / ".agentic-browser" / "demo-seed.json"
CLIENTS = ["browser-extension", "browser-extension", "browser-extension", "debug-web", "telegram"]
NOW = datetime.now(timezone.utc)
rng = random.Random(7)


class Clock:
    """Stands in for run_traces._now so seeded rows get historical timestamps."""

    def __init__(self, start: datetime) -> None:
        self.t = start

    def __call__(self) -> datetime:
        return self.t

    def tick(self, seconds: float) -> None:
        self.t += timedelta(seconds=seconds)


# ── run scenarios ────────────────────────────────────────────────────────────
# Each step: (event payload, seconds until the next step).

def s_summarize(url: str, title: str, answer: str):
    return {
        "entrypoint": "react_agent",
        "title": f"Summarize {title}",
        "prompt": f"Summarize this page in five bullets: {url}",
        "answer": answer,
        "steps": [
            ({"event": "run_started"}, 0.4),
            ({"event": "supervisor_iteration", "iteration": 1, "action": "delegate", "selected_subagent": "web_reader", "reason": "Needs the page content"}, 0.6),
            ({"event": "subagent_started", "subagent": "web_reader", "task": f"Read {url}"}, 0.3),
            ({"event": "subagent_tool_call", "subagent": "web_reader", "tool": "fetch_page_markdown", "args": {"url": url}}, 2.1),
            ({"event": "subagent_tool_result", "subagent": "web_reader", "tool": "fetch_page_markdown", "result": f"{rng.randint(1800, 9000)} chars of markdown"}, 3.4),
            ({"event": "subagent_completed", "subagent": "web_reader", "result": "Page read and condensed"}, 0.5),
            ({"event": "quality_check", "iteration": 1, "satisfactory": True, "score": round(rng.uniform(0.82, 0.97), 2), "feedback": "Covers the main points"}, 0.4),
            ({"event": "final", "answer": answer, "iterations": 1, "satisfactory": True}, 0),
        ],
    }


def s_browser(goal: str, site: str, actions: list[tuple[str, str]], answer: str, *, fail: str | None = None):
    steps: list[tuple[dict[str, Any], float]] = [
        ({"event": "subagent_started", "subagent": "browser_automation", "task": goal}, 0.2),
        ({"event": "automation_started", "goal": goal}, 0.8),
    ]
    for kind, target in actions:
        steps.append(({"event": "subagent_tool_call", "subagent": "browser_automation", "tool": "browser_action_executor", "args": {"action": {"type": kind, "target": target}, "page_url": site}}, rng.uniform(0.6, 2.2)))
        steps.append(({"event": "subagent_tool_result", "subagent": "browser_automation", "tool": "browser_action_executor", "result": {"success": True, "after": {"url": site}}}, rng.uniform(0.4, 1.4)))
    if fail:
        steps.append(({"event": "subagent_tool_call", "subagent": "browser_automation", "tool": "browser_runtime_guard", "args": {"page_url": site}}, 0.5))
        steps.append(({"event": "subagent_tool_error", "subagent": "browser_automation", "tool": "browser_runtime_guard", "error": fail}, 0.2))
        steps.append(({"event": "final", "answer": fail, "status": "blocked"}, 0))
    else:
        steps.append(({"event": "subagent_completed", "subagent": "browser_automation", "result": answer}, 0.3))
        steps.append(({"event": "final", "answer": answer, "iterations": 1, "satisfactory": True}, 0))
    return {"entrypoint": "browser_runtime", "title": goal[:60], "prompt": goal, "answer": answer, "steps": steps, "fail": fail}


def s_tool(entrypoint: str, sub: str, tool: str, args: dict[str, Any], prompt: str, answer: str, title: str, *, error: str | None = None):
    steps: list[tuple[dict[str, Any], float]] = [
        ({"event": "run_started"}, 0.3),
        ({"event": "supervisor_iteration", "iteration": 1, "action": "delegate", "selected_subagent": sub, "reason": f"{sub} has the right tool"}, 0.5),
        ({"event": "subagent_started", "subagent": sub, "task": prompt}, 0.3),
        ({"event": "subagent_tool_call", "subagent": sub, "tool": tool, "args": args}, rng.uniform(1.2, 4.5)),
    ]
    if error:
        steps.append(({"event": "subagent_tool_error", "subagent": sub, "tool": tool, "error": error}, 0.3))
        steps.append(({"event": "error", "message": error}, 0))
    else:
        steps.append(({"event": "subagent_tool_result", "subagent": sub, "tool": tool, "result": answer[:160]}, 1.1))
        steps.append(({"event": "subagent_completed", "subagent": sub, "result": "Done"}, 0.4))
        steps.append(({"event": "quality_check", "iteration": 1, "satisfactory": True, "score": round(rng.uniform(0.78, 0.95), 2), "feedback": "Answers the question"}, 0.3))
        steps.append(({"event": "final", "answer": answer, "iterations": 1, "satisfactory": True}, 0))
    return {"entrypoint": entrypoint, "title": title, "prompt": prompt, "answer": answer, "steps": steps, "error": error}


SCENARIOS = [
    s_summarize("https://www.anthropic.com/research/building-effective-agents", "Building effective agents",
                "- Start with the simplest pattern that works, a single LLM call with retrieval\n- Prefer workflows (fixed paths) until you need open-ended agents\n- Agents earn their cost on tasks with unclear step counts\n- Invest in tool design: clear names, examples and error messages\n- Test in a sandbox and add guardrails before giving write access"),
    s_summarize("https://react.dev/blog/2024/12/05/react-19", "React 19 release notes",
                "- Actions handle pending state, errors and optimistic updates for async transitions\n- useActionState and useFormStatus wrap common form patterns\n- use() reads promises and context during render\n- ref is a normal prop on function components now\n- Document metadata tags hoist to <head> automatically"),
    s_browser("Find the cheapest nonstop SFO to JFK this Friday", "https://www.google.com/travel/flights",
              [("NAVIGATE", "google.com/travel/flights"), ("TYPE", "From: SFO"), ("TYPE", "To: JFK"), ("CLICK", "Nonstop"), ("CLICK", "Sort by price")],
              "Cheapest nonstop: Alaska 1234 at $189, departing 7:05 AM. I left the results open in the Agent tab group."),
    s_tool("gmail", "gmail", "gmail_list_unread", {"max_results": 20}, "Which unread emails need a reply today?",
           "Three need a reply today:\n\n1. **Priya (Acme)**, contract redline, asks for comments by 5 PM\n2. **GitHub**, review requested on `agentic-browser#212`\n3. **Landlord**, confirm the Thursday inspection slot\n\nThe other 14 are newsletters and receipts.", "Unread email triage"),
    s_tool("youtube", "youtube", "get_transcript", {"url": "https://youtu.be/zjkBMFhNj_g"}, "Summarize this talk and list the tools he mentions",
           "Karpathy walks through how LLMs are trained (pretraining, SFT, RLHF) and where they fail. Tools named: llama.cpp, vLLM, Hugging Face datasets, LM Studio.", "Intro to LLMs talk"),
    s_tool("github", "github", "repo_tree_and_readme", {"repo": "tanstack/query"}, "How does TanStack Query decide when to refetch?",
           "Queries refetch when they're **stale** and one of these happens: a new observer mounts, the window regains focus, or the network reconnects. `staleTime` (default 0) controls when data turns stale; `refetchInterval` adds polling.", "TanStack Query refetching"),
    s_tool("calendar", "calendar", "calendar_list_events", {"days": 7}, "What's on my calendar this week?",
           "| Day | Time | Event |\n|---|---|---|\n| Tue | 10:00 | Design review |\n| Wed | 14:30 | 1:1 with Priya |\n| Thu | 09:00 | Apartment inspection |\n| Fri | 16:00 | Demo day |", "This week's calendar"),
    s_tool("google_search", "search", "web_search", {"query": "best rust http client 2026"}, "What's the best Rust HTTP client right now?",
           "**reqwest** is still the default choice: async, mature, wide TLS support. Use **ureq** for blocking code with few dependencies, or **hyper** directly if you need control over connection pooling.", "Rust HTTP clients"),
    s_browser("Fill the Zoho contact form with my work details", "https://www.zoho.com/contact.html",
              [("NAVIGATE", "zoho.com/contact.html"), ("TYPE", "Name"), ("TYPE", "Work email")],
              "", fail="Stopped: the form shows a captcha. Solve it in the tab, then ask me to continue."),
    s_tool("gmail", "gmail", "gmail_send_draft", {"to": "priya@acme.example"}, "Draft a reply to Priya saying I'll send comments by 4",
           "", "Reply to Priya", error="Google token expired (401). Sign in again from Settings to reconnect Gmail."),
    s_tool("react_agent", "memory", "memory_search", {"query": "favorite editor"}, "What editor do I use and what's my theme?",
           "You use **Zed** with the *One Dark* theme, and Vim keybindings. You switched from VS Code in October.", "Editor preferences"),
    s_browser("Add 2 lbs of bananas and oat milk to my Instacart cart", "https://www.instacart.com",
              [("NAVIGATE", "instacart.com"), ("TYPE", "Search: bananas"), ("CLICK", "Add 2 lb"), ("TYPE", "Search: oat milk"), ("CLICK", "Add Oatly Barista")],
              "Added bananas (2 lb) and Oatly Barista to your cart. I didn't check out; the cart total is $9.47."),
]


# ── memory ───────────────────────────────────────────────────────────────────

ENTITIES = [
    ("person", "Ada Lovelace", "The person using the assistant"),
    ("person", "Priya Raman", "Product lead at Acme"),
    ("organization", "Acme Corp", "Client the user consults for"),
    ("project", "agentic-browser", "Browser agent the user is building"),
    ("project", "Demo day", "Friday demo of the agent"),
    ("skill", "TypeScript", None),
    ("skill", "Rust", None),
    ("preference", "Zed editor", None),
    ("topic", "MCP", "Model Context Protocol"),
]

# (text, class, tier, segment, subject, predicate, object, confidence, importance, days_ago, user_confirmed)
CLAIMS = [
    ("Ada lives in San Francisco.", "semantic", "permanent", "core_identity", "Ada Lovelace", "lives_in", "San Francisco", 0.96, 0.9, 60, True),
    ("Ada works as an independent software engineer.", "semantic", "permanent", "core_identity", "Ada Lovelace", "works_as", "software engineer", 0.93, 0.85, 58, True),
    ("Ada prefers short answers with bullet points.", "procedural", "long_term", "preferences_and_corrections", "Ada Lovelace", "prefers", "concise bullets", 0.88, 0.8, 21, True),
    ("Ada uses Zed with the One Dark theme and Vim keybindings.", "semantic", "long_term", "preferences_and_corrections", "Ada Lovelace", "uses", "Zed editor", 0.91, 0.6, 32, False),
    ("Ada switched from VS Code to Zed in October.", "episodic", "long_term", "contextual_incidents", "Ada Lovelace", "switched_to", "Zed editor", 0.84, 0.4, 32, False),
    ("Ada is building agentic-browser, a browser agent with an MCP bridge.", "semantic", "long_term", "projects_and_goals", "Ada Lovelace", "builds", "agentic-browser", 0.95, 0.9, 40, True),
    ("agentic-browser exposes four MCP tools including a code-mode execute tool.", "semantic", "long_term", "projects_and_goals", "agentic-browser", "exposes", "MCP", 0.82, 0.55, 2, False),
    ("Demo day is on Friday at 4 PM.", "episodic", "short_term", "communications_and_commitments", "Demo day", "scheduled_for", "Friday 16:00", 0.9, 0.75, 3, False),
    ("Ada promised Priya contract comments by 4 PM today.", "episodic", "short_term", "communications_and_commitments", "Ada Lovelace", "promised", "Priya Raman", 0.86, 0.85, 0, False),
    ("Priya Raman is the product lead at Acme Corp.", "social", "long_term", "people_and_relationships", "Priya Raman", "works_at", "Acme Corp", 0.92, 0.6, 45, False),
    ("Ada consults for Acme Corp two days a week.", "semantic", "long_term", "projects_and_goals", "Ada Lovelace", "consults_for", "Acme Corp", 0.83, 0.65, 50, False),
    ("Ada is fluent in TypeScript and Rust.", "semantic", "permanent", "skills_and_background", "Ada Lovelace", "knows", "TypeScript", 0.94, 0.7, 70, True),
    ("Ada is learning Rust async and prefers reqwest.", "semantic", "short_term", "skills_and_background", "Ada Lovelace", "learning", "Rust", 0.71, 0.45, 6, False),
    ("Ada wants agents to stop before purchases or sending email.", "procedural", "permanent", "preferences_and_corrections", "Ada Lovelace", "requires", "confirmation before irreversible actions", 0.97, 0.95, 25, True),
    ("Ada usually flies Alaska out of SFO.", "episodic", "short_term", "contextual_incidents", "Ada Lovelace", "flies", "Alaska Airlines", 0.62, 0.3, 4, False),
    ("Ada buys oat milk and bananas weekly on Instacart.", "episodic", "short_term", "contextual_incidents", "Ada Lovelace", "buys", "groceries", 0.58, 0.25, 1, False),
    ("Agents that ask before acting earn more trust from Ada than fully autonomous ones.", "reflective", "long_term", "reflections_and_summaries", "Ada Lovelace", "trusts", "cautious agents", 0.74, 0.55, 12, False),
    ("Apartment inspection is Thursday at 9 AM.", "episodic", "working", "communications_and_commitments", "Ada Lovelace", "has_event", "inspection", 0.88, 0.5, 0, False),
    ("MCP lets coding agents call tools through a standard protocol.", "semantic", "long_term", "skills_and_background", "MCP", "is", "protocol", 0.9, 0.4, 15, False),
    ("Ada dislikes long preambles in answers.", "procedural", "long_term", "preferences_and_corrections", "Ada Lovelace", "dislikes", "preambles", 0.85, 0.7, 19, True),
]

# Memories that were true once and later replaced. Each is stored as
# superseded, with a SUPERSEDES relation from the claim that replaced it, so
# the graph's "Show replaced memories" view has something to show.
# (text, segment, subject, predicate, object, confidence, days_ago, replaced_by)
HISTORY = [
    ("Ada lives in Oakland.", "core_identity", "Ada Lovelace", "lives_in", "Oakland", 0.9, 140,
     "Ada lives in San Francisco."),
    ("Ada uses VS Code as her main editor.", "preferences_and_corrections", "Ada Lovelace", "uses", "VS Code", 0.88, 90,
     "Ada uses Zed with the One Dark theme and Vim keybindings."),
    ("Ada prefers detailed answers with long explanations.", "preferences_and_corrections", "Ada Lovelace", "prefers",
     "detailed answers", 0.8, 45, "Ada prefers short answers with bullet points."),
]

SOURCES = [
    ("chat", "Conversation history", 6),
    ("email", "Gmail", 5),
    ("calendar", "Google Calendar", 6),
    ("profile_document", "resume.pdf", 8),
    ("manual", "Added in Settings", 9),
]


async def seed() -> dict[str, list[str]]:
    await init_db()
    made: dict[str, list[str]] = {k: [] for k in ("conversations", "sources", "entities", "claims", "maintenance", "browser_sessions")}
    real_now = traces._now

    # Spread ~70 runs over 30 days, busier on weekdays and recent days.
    slots: list[datetime] = []
    for day in range(30, -1, -1):
        base = NOW - timedelta(days=day)
        weekday = base.weekday() < 5
        count = rng.choice([1, 2, 3, 3, 4]) if weekday else rng.choice([0, 1, 1, 2])
        if day < 4:
            count += 1
        for _ in range(count):
            slots.append(base.replace(hour=rng.randint(8, 22), minute=rng.randint(0, 59), second=rng.randint(0, 59)))
    slots = sorted(t for t in slots if t < NOW - timedelta(minutes=5))

    try:
        conv_ids: list[str] = []
        for i, started in enumerate(slots):
            sc = SCENARIOS[i % len(SCENARIOS)]
            # Group runs into conversations: a follow-up joins the previous one.
            follow_up = conv_ids and rng.random() < 0.25
            clock = Clock(started)
            traces._now = clock
            async with get_session() as session:
                if follow_up:
                    conv_id = conv_ids[-1]
                else:
                    conv_id = f"conv_{uuid.uuid4().hex[:20]}"
                    session.add(Conversation(conversation_id=conv_id, client_id=rng.choice(CLIENTS), title=sc["title"],
                                             created_at=started, updated_at=started))
                    conv_ids.append(conv_id)
                    made["conversations"].append(conv_id)
                user_msg = f"msg_{uuid.uuid4().hex[:20]}"
                session.add(ConversationMessage(message_id=user_msg, conversation_id=conv_id, role="user", content=sc["prompt"],
                                                client_id="browser-extension", created_at=started))
            trace = await traces.RunTraceService.create_run(conversation_id=conv_id, user_message_id=user_msg,
                                                           client_id="browser-extension", entrypoint=sc["entrypoint"],
                                                           metadata={"goal": sc["prompt"]})
            for payload, wait in sc["steps"]:
                await trace.record_event(payload)
                clock.tick(wait * rng.uniform(0.8, 1.6))
            failed = sc.get("fail") or sc.get("error")
            answer = sc["answer"] or (failed or "")
            async with get_session() as session:
                final_id = f"msg_{uuid.uuid4().hex[:20]}"
                session.add(ConversationMessage(message_id=final_id, conversation_id=conv_id, role="assistant", content=answer,
                                                client_id="browser-extension", created_at=clock.t))
                conv = (await session.execute(select(Conversation).where(Conversation.conversation_id == conv_id))).scalar_one()
                conv.updated_at = clock.t
            await trace.complete_run(final_answer=answer, final_message_id=final_id,
                                     status="failed" if failed else "completed", error=failed)

        # One run still going, so live states show up.
        clock = Clock(NOW - timedelta(seconds=40))
        traces._now = clock
        conv_id = f"conv_{uuid.uuid4().hex[:20]}"
        async with get_session() as session:
            session.add(Conversation(conversation_id=conv_id, client_id="browser-extension",
                                     title="Compare three standing desks under $600", created_at=clock.t, updated_at=clock.t))
        made["conversations"].append(conv_id)
        live = await traces.RunTraceService.create_run(conversation_id=conv_id, user_message_id=None,
                                                      client_id="browser-extension", entrypoint="browser_runtime")
        for payload, wait in [
            ({"event": "subagent_started", "subagent": "browser_automation", "task": "Compare standing desks under $600"}, 3),
            ({"event": "subagent_tool_call", "subagent": "browser_automation", "tool": "browser_action_executor", "args": {"action": {"type": "NAVIGATE", "target": "wirecutter.com/standing-desks"}}}, 6),
            ({"event": "subagent_tool_result", "subagent": "browser_automation", "tool": "browser_action_executor", "result": {"success": True}}, 4),
            ({"event": "subagent_tool_call", "subagent": "browser_automation", "tool": "browser_action_executor", "args": {"action": {"type": "SCROLL", "target": "Our picks"}}}, 0),
        ]:
            await live.record_event(payload)
            clock.tick(wait)
    finally:
        traces._now = real_now

    # Side panel chat history (browser_sessions), in the panel's own event format.
    async with get_session() as session:
        for k, sc in enumerate(SCENARIOS[:8]):
            started = NOW - timedelta(hours=k * 9 + 1, minutes=rng.randint(0, 50))
            sid = f"demo_{uuid.uuid4().hex[:16]}"
            session.add(BrowserSession(session_id=sid, title=sc["title"], created_at=started, updated_at=started + timedelta(minutes=1)))
            session.add(BrowserSessionMessage(message_id=f"{sid}_u", session_id=sid, role="user", content=sc["prompt"], events=[],
                                              created_at=started, updated_at=started))
            t = started
            events = []
            for n, (payload, wait) in enumerate(sc["steps"]):
                kind = payload["event"]
                if payload.get("tool"):
                    args = payload.get("args") or {}
                    target = (args.get("action") or {}).get("target") if isinstance(args.get("action"), dict) else None
                    detail = target or args.get("url") or args.get("query") or args.get("repo") or ""
                    label = f"{payload['tool']} {detail}".strip()
                else:
                    label = payload.get("task") or payload.get("reason") or payload.get("feedback") or kind.replace("_", " ")
                ext_type = {"subagent_tool_call": "tool", "subagent_tool_result": "tool_result", "subagent_tool_error": "error",
                            "supervisor_iteration": "supervisor", "subagent_started": "subagent", "quality_check": "quality",
                            "automation_started": "automation", "final": "final", "error": "error"}.get(kind, kind)
                if kind == "run_started":
                    continue
                if kind == "final":
                    label = "Answer ready" if not payload.get("status") else "Stopped"
                elif kind == "error":
                    label = str(payload.get("message", "Error"))
                t = t + timedelta(seconds=wait + 0.5)
                events.append({"id": f"{sid}_e{n}", "label": str(label)[:120], "type": ext_type, "timestamp": t.isoformat()})
            failed = sc.get("fail") or sc.get("error")
            session.add(BrowserSessionMessage(message_id=f"{sid}_a", session_id=sid, role="assistant",
                                              content=sc["answer"] or f"Error: {failed}", events=events,
                                              created_at=t, updated_at=t))
            made["browser_sessions"].append(sid)

    # Memory
    async with get_session() as session:
        sources = []
        for stype, title, trust in SOURCES:
            src = SourceORM(source_type=stype, title=title, trust_level=trust, metadata_={},
                            created_at=NOW - timedelta(days=rng.randint(10, 60)))
            session.add(src)
            sources.append(src)
        entities: dict[str, EntityORM] = {}
        for etype, name, desc in ENTITIES:
            # The person talking to the assistant is always the "User" entity
            # (see memory/ingestion/extractor.py); their name is an alias.
            if name == "Ada Lovelace":
                ent = EntityORM(entity_type=etype, canonical_name="User", description=desc, aliases=["Ada Lovelace", "Ada"])
            else:
                ent = EntityORM(entity_type=etype, canonical_name=name, description=desc, aliases=[])
            session.add(ent)
            entities[name] = ent
        await session.flush()
        made["sources"] = [str(s.source_id) for s in sources]
        made["entities"] = [str(e.entity_id) for e in entities.values()]

        claims_by_text: dict[str, ClaimORM] = {}
        for text, mclass, tier, segment, subj, pred, obj, conf, imp, days, confirmed in CLAIMS:
            created = NOW - timedelta(days=days, hours=rng.randint(0, 12))
            claim = ClaimORM(
                claim_text=text, memory_class=mclass, tier=tier, segment=segment, status="active",
                subject_entity_id=entities[subj].entity_id if subj in entities else None, predicate=pred,
                object_entity_id=entities[obj].entity_id if obj in entities else None,
                object_literal=None if obj in entities else obj,
                confidence=conf, base_importance=imp, trust_score=round(rng.uniform(0.5, 0.95), 2),
                access_count=rng.randint(0, 40), retrieval_hit_count=rng.randint(0, 25),
                support_count=rng.randint(1, 6), user_confirmed=confirmed,
                created_at=created, last_accessed_at=NOW - timedelta(days=rng.randint(0, max(days, 1))), updated_at=created,
                valid_from=created,
            )
            session.add(claim)
            await session.flush()
            made["claims"].append(str(claim.claim_id))
            src = sources[0] if mclass in ("episodic", "reflective") else rng.choice(sources)
            session.add(EvidenceORM(claim_id=claim.claim_id, source_id=src.source_id, confidence=conf))
            claims_by_text[text] = claim

        for text, segment, subj, pred, obj, conf, days, replaced_by in HISTORY:
            newer = claims_by_text[replaced_by]
            created = NOW - timedelta(days=days)
            old = ClaimORM(
                claim_text=text, memory_class="semantic", tier="long_term", segment=segment, status="superseded",
                subject_entity_id=entities[subj].entity_id, predicate=pred, object_literal=obj,
                confidence=conf, base_importance=0.6, trust_score=0.8, access_count=rng.randint(3, 20),
                retrieval_hit_count=rng.randint(1, 8), support_count=1, user_confirmed=False,
                created_at=created, last_accessed_at=newer.created_at, updated_at=newer.created_at,
                valid_from=created, valid_to=newer.created_at,
            )
            session.add(old)
            await session.flush()
            made["claims"].append(str(old.claim_id))
            session.add(EvidenceORM(claim_id=old.claim_id, source_id=sources[0].source_id, confidence=conf))
            session.add(ClaimRelationORM(from_claim_id=newer.claim_id, to_claim_id=old.claim_id, relation_type="SUPERSEDES"))

        # Maintenance history: hourly, nightly, weekly, with one failure.
        for kind, every, n in (("hourly", timedelta(hours=1), 14), ("nightly", timedelta(days=1), 10), ("weekly", timedelta(days=7), 4)):
            for k in range(n):
                started = NOW - every * (k + 1) + timedelta(minutes=rng.randint(0, 5))
                failed = kind == "nightly" and k == 3
                run = MaintenanceRunORM(
                    run_type=kind, status="failed" if failed else "completed",
                    claims_reviewed=rng.randint(8, 60) if kind == "hourly" else rng.randint(60, 240),
                    claims_updated=rng.randint(0, 9), claims_archived=rng.randint(0, 4),
                    error="Neo4j connection refused during graph sync" if failed else None,
                    started_at=started, finished_at=started + timedelta(seconds=rng.uniform(2, 40)),
                )
                session.add(run)
                await session.flush()
                made["maintenance"].append(str(run.run_id))
    await index_memory(made)
    return made


async def index_memory(made: dict[str, list[str]]) -> None:
    """Mirror the seeded memory into OpenSearch and Neo4j, as ingestion does,
    so agent recall and the graph see it. Best effort: without the stores (or
    an embedding key, which falls back to word hashing) Postgres still holds
    everything and the console still shows it."""
    from core.clients.neo4j import get_neo4j
    from core.clients.opensearch import get_opensearch
    from memory import embeddings

    try:
        os_client = get_opensearch()
        os_client.connect()
        os_client.ensure_indices()
        neo4j = get_neo4j()
        await neo4j.connect()
    except Exception as exc:
        print(f"Skipped search/graph indexing: {exc}")
        return

    async with get_session() as session:
        claims = (await session.execute(select(ClaimORM).where(ClaimORM.claim_id.in_([uuid.UUID(i) for i in made["claims"]])))).scalars().all()
        entities = (await session.execute(select(EntityORM).where(EntityORM.entity_id.in_([uuid.UUID(i) for i in made["entities"]])))).scalars().all()
        relations = (await session.execute(select(ClaimRelationORM).where(ClaimRelationORM.from_claim_id.in_([c.claim_id for c in claims])))).scalars().all()
        for e in entities:
            e.opensearch_id = str(e.entity_id)
        for c in claims:
            c.opensearch_id = str(c.claim_id)

    try:
        vecs = await embeddings.embed_documents([c.claim_text for c in claims] + [f"{e.canonical_name} {e.description or ''} {' '.join(e.aliases or [])}" for e in entities])
    except Exception as exc:
        print(f"Skipped search/graph indexing (embeddings failed: {exc})")
        return
    for c, v in zip(claims, vecs):
        os_client.index_claim(
            str(c.claim_id), c.claim_text, v, c.segment, c.memory_class, c.tier, c.status, c.confidence,
            c.base_importance, c.trust_score, predicate=c.predicate or "", user_confirmed=c.user_confirmed,
            created_at=c.created_at.isoformat(), last_accessed_at=c.last_accessed_at.isoformat(),
            valid_from=c.valid_from.isoformat() if c.valid_from else None,
            valid_to=c.valid_to.isoformat() if c.valid_to else None,
        )
    for e, v in zip(entities, vecs[len(claims):]):
        os_client.index_entity(str(e.entity_id), e.entity_type, e.canonical_name, e.description or "", list(e.aliases or []), v)
        await neo4j.upsert_entity(str(e.entity_id), e.entity_type, e.canonical_name, e.description or "", list(e.aliases or []))
    for c in claims:
        await neo4j.upsert_claim_node(str(c.claim_id), c.claim_text, predicate=c.predicate or "", segment=c.segment, confidence=c.confidence)
        if c.subject_entity_id:
            await neo4j.link_claim_to_entity(str(c.claim_id), str(c.subject_entity_id), "SUBJECT")
        if c.object_entity_id:
            await neo4j.link_claim_to_entity(str(c.claim_id), str(c.object_entity_id), "OBJECT")
    for r in relations:
        await neo4j.create_claim_relation(str(r.from_claim_id), str(r.to_claim_id), r.relation_type)
    print(f"Indexed {len(claims)} memories and {len(entities)} entities in OpenSearch and Neo4j ({embeddings.provider()} embeddings).")


async def unindex_memory(made: dict[str, list[str]]) -> None:
    from core.clients.neo4j import get_neo4j
    from core.clients.opensearch import IDX_CLAIMS, IDX_ENTITIES, get_opensearch

    try:
        os_client = get_opensearch()
        os_client.connect()
        neo4j = get_neo4j()
        await neo4j.connect()
    except Exception:
        return
    for cid in made.get("claims", []):
        os_client.delete_document(IDX_CLAIMS, cid)
        await neo4j.delete_claim_node(cid)
    for eid in made.get("entities", []):
        os_client.delete_document(IDX_ENTITIES, eid)
        await neo4j.delete_entity(eid)


async def reset() -> None:
    if not MANIFEST.exists():
        print("Nothing to reset: no demo-seed.json.")
        return
    made = json.loads(MANIFEST.read_text())
    await unindex_memory(made)
    convs = made.get("conversations", [])
    async with get_session() as session:
        if convs:
            for model in (ToolCall, AgentEvent, SubagentRun):
                await session.execute(delete(model).where(model.conversation_id.in_(convs)))
            await session.execute(delete(AgentRun).where(AgentRun.conversation_id.in_(convs)))
            await session.execute(delete(ConversationMessage).where(ConversationMessage.conversation_id.in_(convs)))
            await session.execute(delete(Conversation).where(Conversation.conversation_id.in_(convs)))
        as_uuid = lambda ids: [uuid.UUID(i) for i in ids]  # noqa: E731
        if made.get("claims"):
            await session.execute(delete(ClaimORM).where(ClaimORM.claim_id.in_(as_uuid(made["claims"]))))
        if made.get("entities"):
            await session.execute(delete(EntityORM).where(EntityORM.entity_id.in_(as_uuid(made["entities"]))))
        if made.get("sources"):
            await session.execute(delete(SourceORM).where(SourceORM.source_id.in_(as_uuid(made["sources"]))))
        if made.get("browser_sessions"):
            sids = made["browser_sessions"]
            await session.execute(delete(BrowserSessionMessage).where(BrowserSessionMessage.session_id.in_(sids)))
            await session.execute(delete(BrowserSession).where(BrowserSession.session_id.in_(sids)))
        if made.get("maintenance"):
            await session.execute(delete(MaintenanceRunORM).where(MaintenanceRunORM.run_id.in_(as_uuid(made["maintenance"]))))
    MANIFEST.unlink()
    print(f"Removed demo data: {len(convs)} conversations, {len(made.get('claims', []))} claims.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--reset", action="store_true", help="remove the data this script added")
    args = parser.parse_args()
    if args.reset:
        asyncio.run(reset())
        return
    if MANIFEST.exists():
        print("Demo data already present. Run with --reset first to reseed.")
        return
    made = asyncio.run(seed())
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(made, indent=2))
    print(
        f"Seeded {len(made['conversations'])} conversations, {len(made['claims'])} memories, "
        f"{len(made['maintenance'])} maintenance runs. Undo with --reset."
    )


if __name__ == "__main__":
    main()
