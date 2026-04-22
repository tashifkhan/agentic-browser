from __future__ import annotations

import asyncio
import json
from typing import Annotated, Any, Awaitable, Callable, Literal, Sequence, TypedDict

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.tools import StructuredTool
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from core.llm import LargeLanguageModel
from .react_tools import build_agent_tools

EventCallback = Callable[[dict[str, Any]], Awaitable[None]]

_llm = LargeLanguageModel().client


def _normalise_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    try:
        return json.dumps(content, ensure_ascii=True, indent=2, default=str)
    except TypeError:
        return str(content)


def _safe_json(value: Any) -> Any:
    try:
        return json.loads(json.dumps(value, default=str))
    except Exception:
        return _normalise_content(value)


def _extract_json_payload(text: str) -> dict[str, Any]:
    candidate = text.strip()
    if "```" in candidate:
        start = candidate.find("{")
        end = candidate.rfind("}")
        if start != -1 and end != -1 and end > start:
            candidate = candidate[start : end + 1]
    return json.loads(candidate)


async def _noop_emit(_: dict[str, Any]) -> None:
    return None


def _partition_tools(tools: Sequence[StructuredTool]) -> dict[str, list[StructuredTool]]:
    name_map = {tool.name: tool for tool in tools}

    groups: dict[str, list[str]] = {
        "research": [
            "websearch_agent",
            "website_agent",
            "youtube_agent",
            "github_agent",
        ],
        "browser": ["browser_action_agent"],
        "productivity": [
            "gmail_agent",
            "gmail_send_email",
            "gmail_list_unread",
            "gmail_mark_read",
            "calendar_agent",
            "calendar_create_event",
            "pyjiit_agent",
        ],
        "coding": ["bash_agent", "python_agent"],
    }

    partitioned: dict[str, list[StructuredTool]] = {
        group: [name_map[name] for name in names if name in name_map]
        for group, names in groups.items()
    }

    partitioned["general"] = list(tools)
    return partitioned


def _instrument_tools(
    tools: Sequence[StructuredTool],
    subagent_name: str,
    emit: EventCallback,
) -> list[StructuredTool]:
    instrumented: list[StructuredTool] = []

    for tool in tools:
        original_coroutine = tool.coroutine
        original_func = tool.func

        async def _wrapped(
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
                    "args": _safe_json(kwargs),
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
                        "result": _safe_json(result),
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
                coroutine=_wrapped,
            )
        )

    return instrumented


class SubAgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], add_messages]
    task: str
    done: bool
    sub_iterations: int
    max_sub_iterations: int
    tool_cycles: int
    max_tool_cycles: int
    repeated_tool_streak: int
    last_tool_signature: str
    abort_tool_loop: bool
    abort_reason: str
    completion_feedback: str
    result: str


class SupervisorState(TypedDict):
    user_goal: str
    supervisor_iteration: int
    max_supervisor_iterations: int
    selected_subagent: str
    supervisor_action: Literal["delegate", "final"]
    subagent_task: str
    subagent_result: str
    draft_answer: str
    evidence_log: list[str]
    satisfactory: bool
    quality_feedback: str
    final_answer: str


class SubAgentRunner:
    def __init__(
        self,
        name: str,
        tools: Sequence[StructuredTool],
        emit: EventCallback,
        max_sub_iterations: int,
    ) -> None:
        self.name = name
        self.emit = emit
        self.max_sub_iterations = max_sub_iterations
        self.tools = _instrument_tools(tools, name, emit)
        self._bound_llm = _llm.bind_tools(list(self.tools))
        self._graph = self._build_graph()

    def _build_graph(self):
        workflow = StateGraph(SubAgentState)
        workflow.add_node("subagent_agent", self._agent_node)
        workflow.add_node("tool_execution", ToolNode(self.tools))
        workflow.add_node("completion_check", self._completion_check_node)
        workflow.add_node("continue_work", self._continue_work_node)

        workflow.add_edge(START, "subagent_agent")
        workflow.add_conditional_edges(
            "subagent_agent",
            self._route_after_agent,
            {
                "tools": "tool_execution",
                "completion_check": "completion_check",
            },
        )
        workflow.add_edge("tool_execution", "subagent_agent")
        workflow.add_conditional_edges(
            "completion_check",
            self._should_finish,
            {
                "finish": END,
                "continue": "continue_work",
            },
        )
        workflow.add_edge("continue_work", "subagent_agent")

        return workflow.compile()

    async def _agent_node(self, state: SubAgentState) -> dict[str, list[BaseMessage]]:
        messages = list(state["messages"])
        if not messages or not isinstance(messages[0], SystemMessage):
            messages = [
                SystemMessage(
                    content=(
                        f"You are the '{self.name}' subagent in a while-loop harness. "
                        "Use tools when needed. Keep iterating until the task is fully complete."
                    )
                )
            ] + messages

        response = await self._bound_llm.ainvoke(messages)

        await self.emit(
            {
                "event": "subagent_message",
                "subagent": self.name,
                "message": _normalise_content(response.content),
            }
        )

        if isinstance(response, AIMessage) and response.tool_calls:
            tool_signature = _normalise_content(
                [
                    {
                        "name": call.get("name") if isinstance(call, dict) else str(call),
                        "args": call.get("args") if isinstance(call, dict) else None,
                    }
                    for call in response.tool_calls
                ]
            )

            previous_signature = str(state.get("last_tool_signature", ""))
            repeated_streak = int(state.get("repeated_tool_streak", 0))
            if tool_signature == previous_signature:
                repeated_streak += 1
            else:
                repeated_streak = 0

            next_tool_cycles = int(state.get("tool_cycles", 0)) + 1
            max_tool_cycles = int(state.get("max_tool_cycles", 8))

            abort_tool_loop = False
            abort_reason = ""
            if repeated_streak >= 3:
                abort_tool_loop = True
                abort_reason = "Detected repeated identical tool calls across multiple turns."
            elif next_tool_cycles >= max_tool_cycles:
                abort_tool_loop = True
                abort_reason = "Reached max tool-call cycles for this subagent run."

            await self.emit(
                {
                    "event": "subagent_tool_calls",
                    "subagent": self.name,
                    "tool_calls": _safe_json(response.tool_calls),
                }
            )

            if abort_tool_loop:
                await self.emit(
                    {
                        "event": "subagent_loop_guard",
                        "subagent": self.name,
                        "reason": abort_reason,
                        "tool_cycles": next_tool_cycles,
                    }
                )

            return {
                "messages": [response],
                "tool_cycles": next_tool_cycles,
                "last_tool_signature": tool_signature,
                "repeated_tool_streak": repeated_streak,
                "abort_tool_loop": abort_tool_loop,
                "abort_reason": abort_reason,
            }

        return {
            "messages": [response],
            "repeated_tool_streak": 0,
            "last_tool_signature": "",
            "abort_tool_loop": False,
            "abort_reason": "",
        }

    def _route_after_agent(self, state: SubAgentState) -> Literal["tools", "completion_check"]:
        if state.get("abort_tool_loop"):
            return "completion_check"

        messages = list(state.get("messages", []))
        if not messages:
            return "completion_check"

        latest = messages[-1]
        if isinstance(latest, AIMessage) and latest.tool_calls:
            return "tools"

        return "completion_check"

    async def _completion_check_node(self, state: SubAgentState) -> dict[str, Any]:
        latest_ai = ""
        for message in reversed(list(state["messages"])):
            if isinstance(message, AIMessage):
                latest_ai = _normalise_content(message.content)
                break

        checker_prompt = (
            "You are a strict completion checker for a subagent loop. "
            "Return only valid JSON with fields: done (boolean), feedback (string). "
            "Mark done=true only if the task is actually completed."
        )

        checker_input = (
            f"Subagent: {self.name}\n"
            f"Task: {state['task']}\n"
            f"Latest response:\n{latest_ai}\n"
            "Decide if this subagent should end now."
        )

        raw = await _llm.ainvoke(
            [
                SystemMessage(content=checker_prompt),
                HumanMessage(content=checker_input),
            ]
        )
        parsed: dict[str, Any]
        try:
            parsed = _extract_json_payload(_normalise_content(raw.content))
        except Exception:
            parsed = {"done": False, "feedback": "Need one more pass to ensure completion."}

        next_iteration = int(state.get("sub_iterations", 0)) + 1
        exceeded = next_iteration >= int(state.get("max_sub_iterations", self.max_sub_iterations))
        guarded = bool(state.get("abort_tool_loop", False))
        done = bool(parsed.get("done", False)) or exceeded or guarded
        feedback = str(parsed.get("feedback", "Continue refining."))
        if guarded:
            guard_reason = str(state.get("abort_reason", "Stopped by loop guard."))
            feedback = f"{feedback} Loop guard: {guard_reason}"

        await self.emit(
            {
                "event": "subagent_completion_check",
                "subagent": self.name,
                "done": done,
                "feedback": feedback,
                "sub_iterations": next_iteration,
            }
        )

        return {
            "done": done,
            "completion_feedback": feedback,
            "sub_iterations": next_iteration,
            "result": latest_ai,
        }

    async def _continue_work_node(self, state: SubAgentState) -> dict[str, list[BaseMessage]]:
        feedback = state.get("completion_feedback", "Keep working.")
        prompt = (
            "Completion check says task is not done yet. "
            f"Feedback: {feedback}\n"
            "Continue with another attempt and use tools as needed."
        )
        return {"messages": [HumanMessage(content=prompt)]}

    def _should_finish(self, state: SubAgentState) -> Literal["finish", "continue"]:
        if state.get("done"):
            return "finish"
        return "continue"

    async def run(self, task: str) -> str:
        initial_state: SubAgentState = {
            "messages": [HumanMessage(content=task)],
            "task": task,
            "done": False,
            "sub_iterations": 0,
            "max_sub_iterations": self.max_sub_iterations,
            "tool_cycles": 0,
            "max_tool_cycles": 8,
            "repeated_tool_streak": 0,
            "last_tool_signature": "",
            "abort_tool_loop": False,
            "abort_reason": "",
            "completion_feedback": "",
            "result": "",
        }

        result = await self._graph.ainvoke(initial_state)
        final = str(result.get("result") or "").strip()
        return final


class SupervisorHarness:
    def __init__(
        self,
        context: dict[str, Any] | None = None,
        emit: EventCallback | None = None,
        max_supervisor_iterations: int = 3,
        max_subagent_iterations: int = 3,
    ) -> None:
        self.context = dict(context or {})
        self.emit = emit or _noop_emit
        self.max_supervisor_iterations = max_supervisor_iterations
        self.max_subagent_iterations = max_subagent_iterations
        self.tools = build_agent_tools(self.context or None)
        self.partitioned_tools = _partition_tools(self.tools)
        self._graph = self._build_graph()

    def _build_graph(self):
        workflow = StateGraph(SupervisorState)

        workflow.add_node("supervisor", self._supervisor_node)
        workflow.add_node("run_subagent", self._run_subagent_node)
        workflow.add_node("quality_check", self._quality_check_node)
        workflow.add_node("finalize", self._finalize_node)

        workflow.add_edge(START, "supervisor")
        workflow.add_conditional_edges(
            "supervisor",
            self._supervisor_route,
            {
                "delegate": "run_subagent",
                "final": "finalize",
            },
        )
        workflow.add_edge("run_subagent", "quality_check")
        workflow.add_conditional_edges(
            "quality_check",
            self._quality_route,
            {
                "continue": "supervisor",
                "final": "finalize",
            },
        )
        workflow.add_edge("finalize", END)

        return workflow.compile()

    async def _supervisor_node(self, state: SupervisorState) -> dict[str, Any]:
        next_iteration = int(state.get("supervisor_iteration", 0)) + 1
        evidence_log = state.get("evidence_log", [])
        quality_feedback = state.get("quality_feedback", "")

        force_final = next_iteration >= int(
            state.get("max_supervisor_iterations", self.max_supervisor_iterations)
        )

        prompt = (
            "You are the supervisor in a while-loop multi-agent harness. "
            "Pick the best subagent and task for the next attempt, or provide final answer if done. "
            "Return only valid JSON with keys: action, subagent, task, final_answer, reason.\n"
            "- action must be 'delegate' or 'final'\n"
            "- subagent must be one of: research, browser, productivity, coding, general\n"
            "- if action='final', fill final_answer\n"
            "- if action='delegate', fill task and subagent"
        )

        user_input = (
            f"User goal:\n{state['user_goal']}\n\n"
            f"Current iteration: {next_iteration}/{state['max_supervisor_iterations']}\n"
            f"Previous quality feedback: {quality_feedback or 'None'}\n"
            f"Evidence log:\n" + "\n".join(evidence_log[-6:])
        )

        raw = await _llm.ainvoke(
            [
                SystemMessage(content=prompt),
                HumanMessage(content=user_input),
            ]
        )

        parsed: dict[str, Any]
        try:
            parsed = _extract_json_payload(_normalise_content(raw.content))
        except Exception:
            parsed = {
                "action": "delegate",
                "subagent": "general",
                "task": state["user_goal"],
                "final_answer": "",
                "reason": "Fallback due to parse error.",
            }

        action = str(parsed.get("action", "delegate")).lower()
        if action not in {"delegate", "final"}:
            action = "delegate"

        if force_final:
            action = "final"

        subagent = str(parsed.get("subagent", "general")).lower()
        if subagent not in self.partitioned_tools:
            subagent = "general"

        task = str(parsed.get("task") or state["user_goal"]).strip()
        final_answer = str(parsed.get("final_answer") or "").strip()
        reason = str(parsed.get("reason") or "").strip()

        await self.emit(
            {
                "event": "supervisor_iteration",
                "iteration": next_iteration,
                "action": action,
                "selected_subagent": subagent,
                "reason": reason,
            }
        )

        return {
            "supervisor_iteration": next_iteration,
            "supervisor_action": action,
            "selected_subagent": subagent,
            "subagent_task": task,
            "final_answer": final_answer,
        }

    def _supervisor_route(self, state: SupervisorState) -> Literal["delegate", "final"]:
        action = str(state.get("supervisor_action", "delegate")).lower()
        if action == "final":
            return "final"
        return "delegate"

    async def _run_subagent_node(self, state: SupervisorState) -> dict[str, Any]:
        subagent_name = state.get("selected_subagent", "general")
        if subagent_name not in self.partitioned_tools:
            subagent_name = "general"

        task = state.get("subagent_task", state["user_goal"])

        await self.emit(
            {
                "event": "subagent_started",
                "iteration": state.get("supervisor_iteration", 0),
                "subagent": subagent_name,
                "task": task,
            }
        )

        runner = SubAgentRunner(
            name=subagent_name,
            tools=self.partitioned_tools.get(subagent_name, self.tools),
            emit=self.emit,
            max_sub_iterations=self.max_subagent_iterations,
        )
        subagent_result = await runner.run(task)

        await self.emit(
            {
                "event": "subagent_completed",
                "iteration": state.get("supervisor_iteration", 0),
                "subagent": subagent_name,
                "result": subagent_result,
            }
        )

        new_log = list(state.get("evidence_log", []))
        new_log.append(
            f"[{subagent_name}] {subagent_result[:600]}"
            if subagent_result
            else f"[{subagent_name}] completed with empty result"
        )

        return {
            "subagent_result": subagent_result,
            "draft_answer": subagent_result,
            "evidence_log": new_log,
        }

    async def _quality_check_node(self, state: SupervisorState) -> dict[str, Any]:
        prompt = (
            "You are a strict quality checker. Evaluate whether the draft answer satisfies the user goal. "
            "Return only JSON: satisfactory (boolean), score (0-10), feedback (string), improved_answer (string)."
        )

        checker_input = (
            f"User goal:\n{state['user_goal']}\n\n"
            f"Draft answer:\n{state.get('draft_answer', '')}\n\n"
            "Assess completeness, correctness, and actionability."
        )

        raw = await _llm.ainvoke(
            [
                SystemMessage(content=prompt),
                HumanMessage(content=checker_input),
            ]
        )

        parsed: dict[str, Any]
        try:
            parsed = _extract_json_payload(_normalise_content(raw.content))
        except Exception:
            parsed = {
                "satisfactory": False,
                "score": 4,
                "feedback": "Could not parse checker output. Run another loop.",
                "improved_answer": state.get("draft_answer", ""),
            }

        satisfactory = bool(parsed.get("satisfactory", False))
        score = int(parsed.get("score", 0) or 0)
        feedback = str(parsed.get("feedback", "")).strip()
        improved_answer = str(parsed.get("improved_answer", "")).strip()

        await self.emit(
            {
                "event": "quality_check",
                "iteration": state.get("supervisor_iteration", 0),
                "satisfactory": satisfactory,
                "score": score,
                "feedback": feedback,
            }
        )

        return {
            "satisfactory": satisfactory,
            "quality_feedback": feedback,
            "draft_answer": improved_answer or state.get("draft_answer", ""),
        }

    def _quality_route(self, state: SupervisorState) -> Literal["continue", "final"]:
        satisfactory = bool(state.get("satisfactory", False))
        iteration = int(state.get("supervisor_iteration", 0))
        max_iterations = int(
            state.get("max_supervisor_iterations", self.max_supervisor_iterations)
        )
        if satisfactory or iteration >= max_iterations:
            return "final"
        return "continue"

    async def _finalize_node(self, state: SupervisorState) -> dict[str, Any]:
        final_answer = (
            state.get("final_answer")
            or state.get("draft_answer")
            or state.get("subagent_result")
            or "I could not produce a reliable answer."
        )

        await self.emit(
            {
                "event": "answer_delta",
                "delta": final_answer,
            }
        )

        await self.emit(
            {
                "event": "final",
                "answer": final_answer,
                "iterations": state.get("supervisor_iteration", 0),
                "satisfactory": bool(state.get("satisfactory", False)),
            }
        )

        return {"final_answer": final_answer}

    async def run(self, user_goal: str) -> str:
        initial_state: SupervisorState = {
            "user_goal": user_goal,
            "supervisor_iteration": 0,
            "max_supervisor_iterations": self.max_supervisor_iterations,
            "selected_subagent": "general",
            "supervisor_action": "delegate",
            "subagent_task": user_goal,
            "subagent_result": "",
            "draft_answer": "",
            "evidence_log": [],
            "satisfactory": False,
            "quality_feedback": "",
            "final_answer": "",
        }

        result = await self._graph.ainvoke(initial_state)
        return str(result.get("final_answer") or "").strip()


async def run_supervisor_harness(
    user_goal: str,
    context: dict[str, Any] | None = None,
    emit: EventCallback | None = None,
    max_supervisor_iterations: int = 3,
    max_subagent_iterations: int = 3,
) -> str:
    harness = SupervisorHarness(
        context=context,
        emit=emit,
        max_supervisor_iterations=max_supervisor_iterations,
        max_subagent_iterations=max_subagent_iterations,
    )
    return await harness.run(user_goal)
