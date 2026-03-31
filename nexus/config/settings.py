"""Nexus configuration and feature flags."""

from __future__ import annotations

import os
from dataclasses import dataclass, field


@dataclass
class TeamSettings:
    """Settings for agent teams."""

    enabled: bool = True
    max_agents_per_team: int = 10
    message_timeout_seconds: int = 30
    allow_parallel_execution: bool = True


@dataclass
class Settings:
    """Global Nexus settings."""

    teams: TeamSettings = field(default_factory=TeamSettings)
    log_level: str = "INFO"

    @classmethod
    def from_env(cls) -> Settings:
        """Load settings from environment variables."""
        teams = TeamSettings(
            enabled=os.getenv("NEXUS_TEAMS_ENABLED", "true").lower() == "true",
            max_agents_per_team=int(os.getenv("NEXUS_MAX_AGENTS_PER_TEAM", "10")),
            message_timeout_seconds=int(os.getenv("NEXUS_MESSAGE_TIMEOUT", "30")),
            allow_parallel_execution=os.getenv("NEXUS_PARALLEL_EXECUTION", "true").lower() == "true",
        )
        return cls(
            teams=teams,
            log_level=os.getenv("NEXUS_LOG_LEVEL", "INFO"),
        )
