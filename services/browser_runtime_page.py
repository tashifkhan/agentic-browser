from __future__ import annotations

from typing import Any

from models.requests.automation import ElementSnapshot, PageSnapshot


def build_page_snapshot_from_dom(
    *,
    dom_structure: dict[str, Any] | None,
    target_url: str = "",
    client_markdown: str = "",
) -> PageSnapshot:
    dom_structure = dict(dom_structure or {})

    interactive: list[ElementSnapshot] = []
    for raw in list(dom_structure.get("interactive") or [])[:80]:
        if not isinstance(raw, dict):
            continue
        interactive.append(
            ElementSnapshot(
                selector=raw.get("selector"),
                tag=raw.get("tag"),
                role=raw.get("role"),
                text=raw.get("text"),
                aria_label=raw.get("aria_label") or raw.get("ariaLabel"),
                placeholder=raw.get("placeholder"),
                id=raw.get("id"),
                name=raw.get("name"),
                href=raw.get("href"),
                input_type=raw.get("input_type") or raw.get("type"),
                value=raw.get("value"),
                clickable=bool(raw.get("clickable", True)),
                visible=bool(raw.get("visible", True)),
            )
        )

    visible_text = client_markdown[:5000]
    if not visible_text and isinstance(dom_structure.get("visible_text"), str):
        visible_text = str(dom_structure.get("visible_text"))[:5000]

    return PageSnapshot(
        url=str(dom_structure.get("url") or target_url or ""),
        title=str(dom_structure.get("title") or "Current Page"),
        visible_text=visible_text,
        interactive=interactive,
    )
