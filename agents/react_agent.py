from __future__ import annotations

import json
from functools import lru_cache
from typing import Annotated, Any, Awaitable, Callable, Literal, Sequence, cast

from typing_extensions import TypedDict

from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_core.tools import StructuredTool
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition

from core.llm import LargeLanguageModel
from .react_tools import AGENT_TOOLS


DEFAULT_SYSTEM_PROMPT = (
    "You are a helpful AI assistant that maintains conversation context and "
    "remembers useful information shared by users. Use the available tools "
    "when they can improve the answer, otherwise reply directly."
)

_llm = LargeLanguageModel().client
_system_message = SystemMessage(content=DEFAULT_SYSTEM_PROMPT)


class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], add_messages]


class AgentMessagePayload(TypedDict, total=False):
    role: Literal["system", "user", "assistant", "tool"]
    content: str
    name: str
    tool_call_id: str
    tool_calls: list[dict[str, Any]]


def _normalise_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    try:
        return json.dumps(content, ensure_ascii=True, indent=2, default=str)
    except TypeError:
        return str(content)


def _payload_to_langchain(message: AgentMessagePayload) -> BaseMessage:
    role = message.get("role", "user")
    name = message.get("name")
    content = _normalise_content(message.get("content", ""))

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


def _create_agent_node(
    tools: Sequence[StructuredTool],
) -> Callable[..., Awaitable[dict[str, list[BaseMessage]]]]:
    bound_llm = _llm.bind_tools(list(tools))

    async def _agent_node(state: AgentState, **_: Any) -> dict[str, list[BaseMessage]]:
        messages = list(state["messages"])
        if not messages or not isinstance(messages[0], SystemMessage):
            messages = [_system_message] + messages
        response = await bound_llm.ainvoke(messages)
        return {"messages": [response]}

    return _agent_node


class GraphBuilder:
    """Constructs and caches the LangGraph workflow for the react agent."""

    def __init__(self, tools: Sequence[StructuredTool] | None = None) -> None:
        self.tools = list(tools) if tools else list(AGENT_TOOLS)
        self._compiled: Any | None = None

    def buildgraph(self):
        agent_node = _create_agent_node(self.tools)

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


@lru_cache(maxsize=1)
def _compiled_graph():
    return GraphBuilder()()


async def run_react_agent(
    messages: Sequence[AgentMessagePayload],
) -> list[AgentMessagePayload]:
    graph = _compiled_graph()
    lc_messages = [_payload_to_langchain(msg) for msg in messages]
    result = await graph.ainvoke({"messages": lc_messages})
    final_messages = result.get("messages", [])
    return [_langchain_to_payload(msg) for msg in final_messages]
