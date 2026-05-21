"""Shared agent registry for PR analysis profiles.

Centralizes supported agent roles, prompt filenames, and profile selection so
schemas and orchestration stay in sync.
"""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Dict, Tuple


GENERIC_AGENT_ROLES: Tuple[str, ...] = (
    "code_review",
    "security",
    "tests",
    "maintainability",
)

JS_TS_AGENT_ROLES: Tuple[str, ...] = (
    "static_analyzer",
    "semantic_analyzer",
    "security_checker",
    "testability_agent",
    "maintainability_agent",
)

ALL_AGENT_ROLES: Tuple[str, ...] = GENERIC_AGENT_ROLES + JS_TS_AGENT_ROLES

JS_TS_EXTENSIONS: Tuple[str, ...] = (
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".mts",
    ".cts",
)


@dataclass(frozen=True)
class AgentProfile:
    name: str
    agents: Tuple[str, ...]


AGENT_PROFILES: Dict[str, AgentProfile] = {
    "generic": AgentProfile(name="generic", agents=GENERIC_AGENT_ROLES),
    "js_ts": AgentProfile(name="js_ts", agents=JS_TS_AGENT_ROLES),
}

PROMPT_FILENAMES: Dict[str, str] = {
    "code_review": "reviewer.yaml",
    "security": "reviewer.yaml",
    "tests": "reviewer.yaml",
    "maintainability": "reviewer.yaml",
    "static_analyzer": "static_analyzer.yaml",
    "semantic_analyzer": "semantic_analyzer.yaml",
    "security_checker": "security_checker.yaml",
    "testability_agent": "testability_agent.yaml",
    "maintainability_agent": "maintainability_agent.yaml",
}


def get_valid_agents() -> Tuple[str, ...]:
    return ALL_AGENT_ROLES


def get_profile_agents(profile_name: str) -> Tuple[str, ...]:
    profile = AGENT_PROFILES.get(profile_name, AGENT_PROFILES["generic"])
    return profile.agents


def get_prompt_filename(agent_name: str) -> str:
    return PROMPT_FILENAMES.get(agent_name, "reviewer.yaml")


def is_js_ts_file(path: str) -> bool:
    lower_path = path.lower()
    return lower_path.endswith(JS_TS_EXTENSIONS)


def detect_profile_from_diff(diff_text: str) -> str:
    """Infer the analysis profile from a unified diff."""

    diff_header_pattern = re.compile(r"^diff --git a/(.+?) b/(.+?)$", re.MULTILINE)
    for match in diff_header_pattern.finditer(diff_text):
        candidate_path = match.group(2)
        if is_js_ts_file(candidate_path):
            return "js_ts"
    return "generic"
