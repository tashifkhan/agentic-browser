"""Progress-based loop guard for agent loops.

Agents used to stop at fixed step counts (8 or 12 browser actions, 8 tool
cycles, LangGraph's 25 graph steps). A long task that was still making progress
got cut off, and a short one that was going in circles still burned every step
it was allowed. This guard stops on lack of progress instead of on a count.

Each step is a (call, outcome) pair:

  call     what the agent did: a browser action, or a tool name plus arguments
  outcome  what came back: the page state after the action, or the tool result

A step makes progress when it succeeds and its outcome hasn't been seen before
in this run (a new page, a new tool result). Four signals mean the agent is
looping:

  repeat     the same call returned the same outcome as before
  cycle      the last few steps repeat an earlier block (A, B, A, B)
  failures   several calls in a row failed
  stalled    several steps in a row made no progress

The first signal is a warning: the caller tells the model what it is repeating
and asks it to change approach or answer with what it has. If the next steps
still make no progress, the verdict becomes stop. Progress after a warning
clears it, so a run can go on as long as it keeps learning something.

There is no step limit by default. Callers can pass `max_steps` (for example
from an environment variable) as an outer safety net.
"""
from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Literal, Optional

Status = Literal["ok", "warn", "stop"]


def fingerprint(value: Any, limit: int = 4000, mask_digits: bool = False) -> str:
    """A stable hash of a call or outcome. Outcomes mask digits so clocks,
    counters and timestamps on a page don't make every state look new. Calls
    keep them: "open row 3" and "open row 4" are different calls."""
    text = value if isinstance(value, str) else json.dumps(value, sort_keys=True, default=str, ensure_ascii=True)
    text = text.lower()
    if mask_digits:
        text = re.sub(r"\d+", "#", text)
    text = re.sub(r"\s+", " ", text).strip()[:limit]
    return hashlib.sha1(text.encode("utf-8", "replace")).hexdigest()[:16]


@dataclass
class Step:
    call: str
    outcome: str
    ok: bool
    label: str = ""


@dataclass
class Verdict:
    status: Status = "ok"
    signal: str = ""      # repeat, cycle, failures, stalled, max_steps
    reason: str = ""      # one sentence for the user and the trace
    hint: str = ""        # what to tell the model when warning

    @property
    def stop(self) -> bool:
        return self.status == "stop"

    @property
    def warn(self) -> bool:
        return self.status == "warn"

    def to_dict(self) -> dict[str, str]:
        return {"status": self.status, "signal": self.signal, "reason": self.reason}


@dataclass
class LoopGuard:
    patience: int = 5            # steps in a row without progress before warning
    repeat_limit: int = 2        # times a (call, outcome) pair may occur before warning
    failure_limit: int = 3       # failed calls in a row before warning
    grace: int = 2               # steps allowed after a warning to show progress
    max_steps: Optional[int] = None
    kind: str = "step"           # "browser action" or "tool call", for messages

    steps: list[Step] = field(default_factory=list)
    _outcomes: set[str] = field(default_factory=set)
    _pairs: Counter = field(default_factory=Counter)
    _since_progress: int = 0
    _fail_streak: int = 0
    _warned_at: Optional[int] = None
    _last: Verdict = field(default_factory=Verdict)

    @property
    def verdict(self) -> Verdict:
        return self._last

    def seed(self, outcome: Any) -> None:
        """Mark the starting state as seen (the page before the first action)."""
        self._outcomes.add(fingerprint(outcome, mask_digits=True))

    def record(self, call: Any, outcome: Any, ok: bool = True, label: str = "") -> Verdict:
        c, o = fingerprint(call), fingerprint(outcome, mask_digits=True)
        novel = o not in self._outcomes
        self._outcomes.add(o)
        self._pairs[(c, o)] += 1
        self._fail_streak = 0 if ok else self._fail_streak + 1
        progress = ok and novel
        self._since_progress = 0 if progress else self._since_progress + 1
        self.steps.append(Step(c, o, ok, label or str(call)[:120]))
        if progress:
            self._warned_at = None
        self._last = self._judge(c, o)
        return self._last

    def _cycle(self) -> int:
        """Length of a block that repeats at the end of the history, or 0."""
        seq = [(s.call, s.outcome) for s in self.steps]
        for k in (1, 2, 3):
            if len(seq) >= 2 * k and seq[-k:] == seq[-2 * k:-k] and len(set(seq[-k:])) == k:
                return k
        return 0

    def _judge(self, c: str, o: str) -> Verdict:
        n = len(self.steps)
        last = self.steps[-1].label
        signal = reason = hint = ""
        if self.max_steps and n >= self.max_steps:
            return Verdict("stop", "max_steps", f"Stopped after the configured limit of {self.max_steps} {self.kind}s.")
        if self._pairs[(c, o)] >= self.repeat_limit:
            signal = "repeat"
            reason = f"The same {self.kind} ({last}) gave the same result {self._pairs[(c, o)]} times."
            hint = f"You already ran {last} and got this exact result. Running it again won't change it."
        elif (k := self._cycle()):
            signal = "cycle"
            reason = f"The last {2 * k} {self.kind}s repeat the same {k}-step pattern."
            hint = "You are going back and forth between the same states."
        elif self._fail_streak >= self.failure_limit:
            signal = "failures"
            reason = f"{self._fail_streak} {self.kind}s in a row failed."
            hint = "Your recent attempts all failed the same way."
        elif self._since_progress >= self.patience:
            signal = "stalled"
            reason = f"{self._since_progress} {self.kind}s in a row produced nothing new."
            hint = "Your recent steps haven't produced anything new."
        if not signal:
            return Verdict()
        if self._warned_at is not None and n - self._warned_at >= self.grace:
            return Verdict("stop", signal, f"Stopped a loop: {reason}")
        if self._warned_at is None:
            self._warned_at = n
        return Verdict("warn", signal, reason,
                       f"Loop check: {hint} Try a different approach, or if you have enough, stop and answer with what you found.")

    def summary(self) -> dict[str, Any]:
        return {"steps": len(self.steps), "since_progress": self._since_progress,
                "fail_streak": self._fail_streak, "verdict": self._last.to_dict()}


def env_max_steps(name: str) -> Optional[int]:
    """Optional outer cap from the environment. Unset or 0 means no cap."""
    import os
    try:
        value = int(os.environ.get(name, "0"))
    except ValueError:
        return None
    return value if value > 0 else None
