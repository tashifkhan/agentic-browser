from __future__ import annotations

import asyncio
import json
from typing import Any, Awaitable, Callable, Sequence

from langchain_core.tools import StructuredTool

EventCallback = Callable[[dict[str, Any]], Awaitable[None]]


def normalise_tool_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    try:
        return json.dumps(content, ensure_ascii=True, indent=2, default=str)
    except TypeError:
        return str(content)


def safe_json(value: Any) -> Any:
    try:
        return json.loads(json.dumps(value, default=str))
    except Exception:
        return normalise_tool_content(value)


async def noop_emit(_: dict[str, Any]) -> None:
    return None


def instrument_tools(
    tools: Sequence[StructuredTool],
    subagent_name: str,
    emit: EventCallback,
) -> list[StructuredTool]:
    instrumented: list[StructuredTool] = []

    for tool in tools:
        original_coroutine = tool.coroutine
        original_func = tool.func

        async def wrapped(
            _tool: StructuredTool = tool,
            _coroutine: Any = original_coroutine,
            _func: Any = original_func,
            **kwargs: Any,
        ) -> Any:
            await emit(
                {
                    "event": "subagent_tool_call",
                    "subagent": subagent_name,
                    "tool": _tool.name,
                    "args": safe_json(kwargs),
                }
            )

            try:
                if _coroutine is not None:
                    result = await _coroutine(**kwargs)
                elif _func is not None:
                    result = await asyncio.to_thread(_func, **kwargs)
                else:
                    raise RuntimeError(f"Tool {_tool.name} does not define a callable")

                await emit(
                    {
                        "event": "subagent_tool_result",
                        "subagent": subagent_name,
                        "tool": _tool.name,
                        "result": safe_json(result),
                    }
                )
                return result
            except Exception as exc:
                await emit(
                    {
                        "event": "subagent_tool_error",
                        "subagent": subagent_name,
                        "tool": _tool.name,
                        "error": str(exc),
                    }
                )
                raise

        instrumented.append(
            StructuredTool(
                name=tool.name,
                description=tool.description,
                args_schema=tool.args_schema,
                coroutine=wrapped,
            )
        )

    return instrumented
