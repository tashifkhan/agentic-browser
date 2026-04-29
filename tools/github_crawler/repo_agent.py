"""
GitHub Repo Agent — clones a repository and uses a ReAct sub-agent with bash/read/search
tools to traverse the codebase and answer questions.
"""

from __future__ import annotations

import asyncio
import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Annotated, Any, Optional, Sequence, TypedDict

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.tools import StructuredTool
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from pydantic import BaseModel, Field

from core.llm import get_default_llm

_SYSTEM_PROMPT = """\
You are an expert GitHub repository analyst. The repository has been cloned to: {repo_dir}

Your task:
1. Start by listing the root directory to understand the project structure.
2. Read key files (README, package.json, pyproject.toml, main entry points, etc.).
3. Search for relevant patterns or symbols when needed.
4. Synthesize your findings into a clear, accurate answer referencing specific files and code.

Be thorough but efficient — read what you need, then answer decisively.
"""

MAX_FILE_BYTES = 200_000
MAX_SEARCH_LINES = 150


class _BashInput(BaseModel):
    command: str = Field(..., description="Bash command executed in the repository root directory.")
    timeout: int = Field(default=30, description="Timeout in seconds (max 60).")


class _ReadFileInput(BaseModel):
    path: str = Field(..., description="File path relative to repository root (e.g. 'src/main.py').")


class _SearchInput(BaseModel):
    pattern: str = Field(..., description="Grep regex pattern to search for.")
    file_glob: str = Field(default="", description="Optional glob to limit files (e.g. '*.py', '*.ts').")


def _make_repo_tools(repo_dir: str) -> list[StructuredTool]:
    root = Path(repo_dir).resolve()

    async def _bash(command: str, timeout: int = 30) -> str:
        timeout = min(max(timeout, 1), 60)

        def _run() -> str:
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=str(root),
            )
            out = result.stdout or ""
            if result.stderr:
                out += f"\n[stderr]: {result.stderr.strip()}"
            if result.returncode != 0:
                out += f"\n[exit code {result.returncode}]"
            return out.strip() or "(no output)"

        try:
            return await asyncio.to_thread(_run)
        except subprocess.TimeoutExpired:
            return f"Command timed out after {timeout}s."
        except Exception as exc:
            return f"bash error: {exc}"

    async def _read_file(path: str) -> str:
        try:
            target = (root / path).resolve()
            if not str(target).startswith(str(root)):
                return "Error: path escapes repository root."
            if not target.exists():
                return f"File not found: {path}"
            if not target.is_file():
                return f"Not a file: {path}"
            size = target.stat().st_size
            if size > MAX_FILE_BYTES:
                return (
                    f"File is large ({size:,} bytes). Use bash with `head -n 100 {path}` "
                    f"or `grep` to read specific sections."
                )
            return target.read_text(errors="replace")
        except Exception as exc:
            return f"read_file error: {exc}"

    async def _search(pattern: str, file_glob: str = "") -> str:
        cmd = ["grep", "-rn", "--color=never"]
        if file_glob:
            cmd += ["--include", file_glob]
        cmd += [pattern, "."]

        def _run() -> str:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30,
                cwd=str(root),
            )
            out = result.stdout.strip()
            if not out:
                return "No matches found."
            lines = out.splitlines()
            if len(lines) > MAX_SEARCH_LINES:
                lines = lines[:MAX_SEARCH_LINES]
                lines.append(f"... output truncated (showing {MAX_SEARCH_LINES} of many matches)")
            return "\n".join(lines)

        try:
            return await asyncio.to_thread(_run)
        except subprocess.TimeoutExpired:
            return "Search timed out."
        except Exception as exc:
            return f"search_files error: {exc}"

    return [
        StructuredTool(
            name="bash",
            description=(
                "Run a bash command in the repository root directory. "
                "Use for: ls, find, tree, cat, head, wc, file counts, etc."
            ),
            coroutine=_bash,
            args_schema=_BashInput,
        ),
        StructuredTool(
            name="read_file",
            description="Read a file's full contents by its path relative to the repository root.",
            coroutine=_read_file,
            args_schema=_ReadFileInput,
        ),
        StructuredTool(
            name="search_files",
            description=(
                "Search for a regex pattern across the repository using grep. "
                "Optionally restrict to a file glob like '*.py' or '*.ts'."
            ),
            coroutine=_search,
            args_schema=_SearchInput,
        ),
    ]


class _State(TypedDict):
    messages: Annotated[Sequence[BaseMessage], add_messages]


def _extract_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            p.get("text", "") if isinstance(p, dict) else str(p) for p in content
        )
    try:
        return json.dumps(content, default=str)
    except Exception:
        return str(content)


async def run_github_repo_agent(
    url: str,
    question: str,
    chat_history: Optional[list[dict[str, Any]]] = None,
) -> str:
    """
    Clone a public GitHub repository, then run a ReAct sub-agent with bash/read/search
    tools to traverse the codebase and answer the given question.
    """
    tmp_dir = tempfile.mkdtemp(prefix="github_agent_")

    try:
        clone = await asyncio.to_thread(
            subprocess.run,
            ["git", "clone", "--depth=1", "--", url, tmp_dir],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if clone.returncode != 0:
            return (
                f"Could not clone the repository.\n"
                f"Make sure the URL is correct and the repository is public.\n"
                f"Details: {clone.stderr.strip()}"
            )

        tools = _make_repo_tools(tmp_dir)
        llm = get_default_llm().client.bind_tools(tools)
        system_prompt = _SYSTEM_PROMPT.format(repo_dir=tmp_dir)

        # Compose user message with optional history
        if chat_history:
            history_str = "\n".join(
                f"{e.get('role', 'user')}: {e.get('content', '')}"
                for e in chat_history
                if isinstance(e, dict)
            )
            user_message = f"Previous conversation:\n{history_str}\n\nQuestion: {question}"
        else:
            user_message = question

        async def _agent_node(state: _State) -> dict:
            msgs = list(state["messages"])
            if not msgs or not isinstance(msgs[0], SystemMessage):
                msgs = [SystemMessage(content=system_prompt)] + msgs
            response = await llm.ainvoke(msgs)
            return {"messages": [response]}

        workflow = StateGraph(_State)
        workflow.add_node("agent", _agent_node)
        workflow.add_node("tools", ToolNode(tools))
        workflow.add_edge(START, "agent")
        workflow.add_conditional_edges("agent", tools_condition, {"tools": "tools", END: END})
        workflow.add_edge("tools", "agent")
        graph = workflow.compile()

        result = await graph.ainvoke({"messages": [HumanMessage(content=user_message)]})

        for msg in reversed(result.get("messages", [])):
            if isinstance(msg, AIMessage):
                text = _extract_text(msg.content)
                if text.strip():
                    return text

        return "The agent completed traversal but did not produce a response."

    except subprocess.TimeoutExpired:
        return "Repository cloning timed out. The repository may be too large or unreachable."
    except Exception as exc:
        return f"GitHub agent error: {exc}"
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
