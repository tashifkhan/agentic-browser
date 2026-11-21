from __future__ import annotations

import json
from collections.abc import AsyncGenerator
from typing import Annotated, Any, Awaitable, Callable, Literal, Sequence, cast

from typing import TypedDict

from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_core.callbacks.manager import adispatch_custom_event
from langchain_core.tools import StructuredTool
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition

from core.config import get_logger
from core.llm import get_default_llm
from core.loop_guard import LoopGuard, Verdict, env_max_steps
from .react_tools import AGENT_TOOLS, build_agent_tools
from .tool_eventing import EventCallback, instrument_tools

logger = get_logger(__name__)


DEFAULT_SYSTEM_PROMPT = (
    "You are a helpful AI assistant that maintains conversation context and "
    "remembers useful information shared by users. Memory is external durable state, "
    "not model memory. Call recall_memory early when a request touches user preferences, "
    "identity, projects, relationships, history, or prior decisions. Call write_memory "
    "for durable facts worth preserving. Call recall_document_facts when the user asks "
    "about resume, LinkedIn, Google profile, uploaded PDFs, or document-grounded facts. "
    "Use composio_linkedin_me or composio_aeroleads_linkedin when the user asks to ingest "
    "or refresh LinkedIn/AeroLeads profile memory through connected Composio accounts. "
    "To act on a website (search, click, fill a form, check something behind a login), "
    "use browser_task; it runs in the user's own browser and works even when they're "
    "messaging from their phone. For apps connected through Composio (Slack, Notion, "
    "GitHub, Linear and others) prefer composio_apps then composio_action. Only buy, "
    "pay, send, post or delete when the user explicitly asked for exactly that. "
    "Never store secrets, tokens, temporary page "
    "state, or transient feelings. Use the available tools "
    "when they can improve the answer, otherwise reply directly. "
    "Credentials such as Google access tokens and PyJIIT login sessions are provided "
    "automatically; never request them from the user. If a request involves JIIT "
    "attendance or portal data, call the 'pyjiit_agent' tool immediately using the "
    "existing session. If that session fails, report that the login session expired "
    "and ask the user to refresh it via the secure flow—do not ask for usernames or passwords."
)

_system_message = SystemMessage(content=DEFAULT_SYSTEM_PROMPT)


def _llm_signature() -> tuple[str, str, float]:
    model = get_default_llm()
    return (model.provider, model.model_name, model.client.temperature)


class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], add_messages]


class AgentMessagePayload(TypedDict, total=False):
    role: Literal["system", "user", "assistant", "tool"]
    content: str | list[dict[str, Any]]
    name: str
    tool_call_id: str
    tool_calls: list[dict[str, Any]]


def _normalise_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict) and part.get("type") == "text":
                parts.append(str(part.get("text") or ""))
        # Thinking/reasoning blocks are not part of the message text. A list
        # with only those blocks used to be dumped as JSON into the history.
        return "".join(parts)
    try:
        return json.dumps(content, ensure_ascii=True, indent=2, default=str)
    except TypeError:
        return str(content)


def _payload_to_langchain(message: AgentMessagePayload) -> BaseMessage:
    role = message.get("role", "user")
    name = message.get("name")
    raw = message.get("content", "")
    if role == "user" and isinstance(raw, list) and any(
        isinstance(p, dict) and p.get("type") != "text" for p in raw
    ):
        # Images and other non-text blocks go to the model as they are.
        return HumanMessage(content=raw, name=name)
    content = _normalise_content(raw)

    if role == "system":
        return SystemMessage(content=content, name=name)
    if role == "assistant":
        tool_calls = message.get("tool_calls") or []
        return AIMessage(content=content, name=name, tool_calls=tool_calls)
    if role == "tool":
        return ToolMessage(
            content=content,
            tool_call_id=message.get("tool_call_id", name or "tool_call"),
            name=name,
        )
    return HumanMessage(content=content, name=name)


def _langchain_to_payload(message: BaseMessage) -> AgentMessagePayload:
    if isinstance(message, SystemMessage):
        role: Literal["system", "user", "assistant", "tool"] = "system"
    elif isinstance(message, AIMessage):
        role = "assistant"
    elif isinstance(message, ToolMessage):
        role = "tool"
    else:
        role = "user"

    payload: AgentMessagePayload = {
        "role": role,
        "content": _normalise_content(message.content),
    }

    if getattr(message, "name", None):
        payload["name"] = message.name  # type: ignore[attr-defined]

    if isinstance(message, AIMessage) and message.tool_calls:
        serialised: list[dict[str, Any]] = []
        for call in message.tool_calls:
            if isinstance(call, dict):
                serialised.append(cast(dict[str, Any], call))
            elif hasattr(call, "model_dump"):
                serialised.append(
                    cast(dict[str, Any], call.model_dump())  # type: ignore[call-arg]
                )
            elif hasattr(call, "dict"):
                serialised.append(
                    cast(dict[str, Any], call.dict())  # type: ignore[call-arg]
                )
            else:
                serialised.append(
                    cast(dict[str, Any], json.loads(json.dumps(call, default=str)))
                )
        payload["tool_calls"] = serialised

    if isinstance(message, ToolMessage) and message.tool_call_id:
        payload["tool_call_id"] = message.tool_call_id

    return payload


AGENT_TURN_TAG = "agent_turn"


def _is_agent_turn(event: dict[str, Any]) -> bool:
    return AGENT_TURN_TAG in (event.get("tags") or []) and (event.get("metadata") or {}).get("langgraph_node") == "agent"


def _thinking_client(client: Any) -> Any:
    """A copy of the chat client that also returns reasoning summaries.

    Only the agent graph uses this copy. Turning thoughts on for the shared
    client would change `.content` into block lists for every caller that
    parses plain text or JSON out of a response.
    """
    try:
        from langchain_google_genai import ChatGoogleGenerativeAI

        if isinstance(client, ChatGoogleGenerativeAI):
            return client.model_copy(update={"include_thoughts": True})
    except Exception:  # pragma: no cover - optional provider
        pass
    return client


# Graph steps are not the limit any more; the loop guard is. LangGraph still
# needs a number, so give it one that a progressing run won't reach.
RECURSION_LIMIT = 2000


def tool_loop_verdict(messages: Sequence[BaseMessage]) -> Verdict:
    """Replay the tool calls and results so far through a LoopGuard."""
    guard = LoopGuard(kind="tool call", patience=4, max_steps=env_max_steps("AGENT_MAX_TOOL_CALLS"))
    calls: dict[str, tuple[str, Any]] = {}
    for message in messages:
        if isinstance(message, AIMessage):
            for call in message.tool_calls or []:
                calls[str(call.get("id"))] = (str(call.get("name")), call.get("args"))
        elif isinstance(message, ToolMessage):
            name, args = calls.get(str(message.tool_call_id), (getattr(message, "name", "") or "tool", None))
            guard.record({"tool": name, "args": args}, _normalise_content(message.content),
                         ok=getattr(message, "status", "success") != "error", label=name)
    return guard.verdict


def _create_agent_node(
    tools: Sequence[StructuredTool],
    stream_thoughts: bool = False,
) -> Callable[..., Awaitable[dict[str, list[BaseMessage]]]]:
    client = get_default_llm().client
    if stream_thoughts:
        client = _thinking_client(client)
    # The tag marks this model's runs as the agent's own turns. Tools can make
    # nested model calls (write_memory runs the reconcile judge); those must not
    # stream into the user's answer.
    bound_llm = client.bind_tools(list(tools)).with_config(tags=[AGENT_TURN_TAG])
    final_llm = client.with_config(tags=[AGENT_TURN_TAG])

    async def _agent_node(state: AgentState, **_: Any) -> dict[str, list[BaseMessage]]:
        messages = list(state["messages"])
        if not messages or not isinstance(messages[0], SystemMessage):
            messages = [_system_message] + messages
        verdict = tool_loop_verdict(messages)
        if verdict.status != "ok":
            logger.info("ReAct loop guard (%s): %s", verdict.status, verdict.reason)
            try:
                await adispatch_custom_event("loop_guard", verdict.to_dict())
            except Exception:  # outside a streamed run there is no listener
                pass
        if verdict.stop:
            # Answer without tools: the run ends with what was found, not an error.
            response = await final_llm.ainvoke(messages + [HumanMessage(content=(
                f"Loop check: {verdict.reason} Stop calling tools. Answer now with what you have found, "
                "and say plainly what you could not find."))])
            return {"messages": [response]}
        if verdict.warn:
            messages = messages + [HumanMessage(content=verdict.hint)]
        response = await bound_llm.ainvoke(messages)
        return {"messages": [response]}

    return _agent_node


class GraphBuilder:
    """Constructs and caches the LangGraph workflow for the react agent."""

    def __init__(
        self,
        tools: Sequence[StructuredTool] | None = None,
        context: dict[str, Any] | None = None,
        emit: EventCallback | None = None,
        subagent_name: str = "react",
        stream_thoughts: bool = False,
    ) -> None:
        self.stream_thoughts = stream_thoughts
        if tools is not None:
            self.tools = list(tools)
        elif context:
            self.tools = build_agent_tools(context)
        else:
            self.tools = list(AGENT_TOOLS)
        if emit is not None:
            self.tools = instrument_tools(self.tools, subagent_name, emit)
        self._compiled: Any | None = None

    def buildgraph(self):
        agent_node = _create_agent_node(self.tools, stream_thoughts=self.stream_thoughts)

        workflow = StateGraph(AgentState)
        workflow.add_node("agent", agent_node)
        workflow.add_node("tool_execution", ToolNode(self.tools))
        workflow.add_edge(START, "agent")
        workflow.add_conditional_edges(
            "agent",
            tools_condition,
            {
                "tools": "tool_execution",
                END: END,
            },
        )
        workflow.add_edge("tool_execution", "agent")
        return workflow.compile()

    def __call__(self):
        if self._compiled is None:
            self._compiled = self.buildgraph()
        return self._compiled


_GRAPH_CACHE: dict[tuple[str, str, float], Any] = {}


def _compiled_graph():
    sig = _llm_signature()
    graph = _GRAPH_CACHE.get(sig)
    if graph is None:
        graph = GraphBuilder()()
        _GRAPH_CACHE.clear()
        _GRAPH_CACHE[sig] = graph
    return graph


async def run_react_agent(
    messages: Sequence[AgentMessagePayload],
    context: dict[str, Any] | None = None,
    emit: EventCallback | None = None,
    subagent_name: str = "react",
) -> list[AgentMessagePayload]:
    if emit is not None:
        graph = GraphBuilder(context=context, emit=emit, subagent_name=subagent_name)()
    else:
        graph = GraphBuilder(context=context)() if context else _compiled_graph()
    lc_messages = [_payload_to_langchain(msg) for msg in messages]
    if not lc_messages or not isinstance(lc_messages[0], SystemMessage):
        lc_messages = [_system_message] + lc_messages
    else:
        lc_messages = [_system_message, *lc_messages]
    result = await graph.ainvoke({"messages": lc_messages}, config={"recursion_limit": RECURSION_LIMIT})
    final_messages = result.get("messages", [])
    return [_langchain_to_payload(msg) for msg in final_messages]


def _split_chunk(content: Any) -> tuple[str, str]:
    """Split a streamed chunk into (answer text, reasoning text).

    Providers send either a string or a list of blocks: {"type": "text"},
    {"type": "thinking"} (Gemini, Anthropic) or {"type": "reasoning"}.
    """
    if isinstance(content, str):
        return content, ""
    text: list[str] = []
    thought: list[str] = []
    for part in content or []:
        if isinstance(part, str):
            text.append(part)
        elif isinstance(part, dict):
            kind = part.get("type")
            if kind == "text":
                text.append(str(part.get("text") or ""))
            elif kind in ("thinking", "reasoning"):
                value = part.get("thinking") or part.get("reasoning") or part.get("text") or ""
                if not value and isinstance(part.get("summary"), list):
                    value = "".join(str(s.get("text", "")) for s in part["summary"] if isinstance(s, dict))
                thought.append(str(value))
    return "".join(text), "".join(thought)


def _short(value: Any, limit: int = 1500) -> Any:
    """JSON-safe, size-capped copy of a tool argument or result."""
    if hasattr(value, "content"):  # ToolMessage and friends
        value = _normalise_content(value.content)
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value[:limit] + ("…" if len(value) > limit else "") if isinstance(value, str) else value
    try:
        text = json.dumps(value, default=str, ensure_ascii=False)
    except Exception:
        text = str(value)
    if len(text) <= limit:
        try:
            return json.loads(text)
        except Exception:
            return text
    return text[:limit] + "…"


async def astream_react_agent(
    messages: Sequence[AgentMessagePayload],
    context: dict[str, Any] | None = None,
    subagent_name: str = "react",
) -> AsyncGenerator[dict[str, Any], None]:
    """Stream one ReAct run as UI events.

    Events:
      thinking_delta      {step, delta}          reasoning summary, live
      thinking            {step, text}           whole block, once per model step
      answer_delta        {step, delta}          answer text, live. Text written
                                                 before a tool call is kept: models
                                                 often put real content there.
      subagent_tool_call  {call_id, tool, args}
      subagent_tool_result{call_id, tool, result, status}
    """
    graph = GraphBuilder(context=context, stream_thoughts=True)()
    lc_messages = [_payload_to_langchain(msg) for msg in messages]
    lc_messages = [_system_message, *lc_messages]

    steps: dict[str, int] = {}
    text_by_step: dict[str, list[str]] = {}
    thought_by_step: dict[str, list[str]] = {}

    async for event in graph.astream_events({"messages": lc_messages}, version="v2", config={"recursion_limit": RECURSION_LIMIT}):
        kind = event["event"]
        run_id = str(event.get("run_id", ""))
        if kind.startswith("on_chat_model") and not _is_agent_turn(event):
            continue
        if kind == "on_chat_model_start":
            steps[run_id] = len(steps) + 1
        elif kind == "on_chat_model_stream":
            step = steps.get(run_id, 0)
            text, thought = _split_chunk(event["data"]["chunk"].content)
            if thought:
                thought_by_step.setdefault(run_id, []).append(thought)
                yield {"event": "thinking_delta", "step": step, "delta": thought}
            if text:
                text_by_step.setdefault(run_id, []).append(text)
                yield {"event": "answer_delta", "step": step, "delta": text}
        elif kind == "on_chat_model_end":
            step = steps.get(run_id, 0)
            thought = "".join(thought_by_step.pop(run_id, []))
            if thought:
                yield {"event": "thinking", "step": step, "text": thought[:6000]}
            text_by_step.pop(run_id, None)
        elif kind == "on_custom_event" and event.get("name") == "loop_guard":
            yield {"event": "loop_guard", "subagent": subagent_name, **(event.get("data") or {})}
        elif kind == "on_tool_start":
            yield {
                "event": "subagent_tool_call",
                "subagent": subagent_name,
                "call_id": run_id,
                "tool": event["name"],
                "args": _short(event["data"].get("input"), 600),
            }
        elif kind == "on_tool_end":
            output = event["data"].get("output")
            status = getattr(output, "status", "success")
            yield {
                "event": "subagent_tool_result" if status != "error" else "subagent_tool_error",
                "subagent": subagent_name,
                "call_id": run_id,
                "tool": event["name"],
                "result": _short(output),
                **({"error": _short(output, 300)} if status == "error" else {}),
            }
        elif kind == "on_tool_error":
            yield {
                "event": "subagent_tool_error",
                "subagent": subagent_name,
                "call_id": run_id,
                "tool": event["name"],
                "error": _short(str(event["data"].get("error", "")), 300),
            }
