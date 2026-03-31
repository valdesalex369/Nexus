"""Base agent class and core types for Nexus agent teams."""

from __future__ import annotations

import asyncio
import logging
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any

logger = logging.getLogger(__name__)


class AgentStatus(Enum):
    """Current status of an agent."""

    IDLE = "idle"
    RUNNING = "running"
    PAUSED = "paused"
    ERROR = "error"
    STOPPED = "stopped"


class AgentRole(Enum):
    """Predefined roles agents can fulfill within a team."""

    COORDINATOR = "coordinator"
    CONTENT_CREATOR = "content_creator"
    SCHEDULER = "scheduler"
    ANALYST = "analyst"
    MODERATOR = "moderator"
    CUSTOM = "custom"


@dataclass
class Message:
    """A message passed between agents in a team."""

    sender: str
    recipient: str
    content: Any
    message_type: str = "default"
    id: str = field(default_factory=lambda: uuid.uuid4().hex)
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def __repr__(self) -> str:
        return f"Message({self.sender} -> {self.recipient}, type={self.message_type})"


class Agent(ABC):
    """Base class for all Nexus agents.

    Subclass this and implement `execute` to create a custom agent.
    Optionally override `handle_message` to react to inter-agent messages.
    """

    def __init__(
        self,
        name: str,
        role: AgentRole = AgentRole.CUSTOM,
        description: str = "",
    ) -> None:
        self.id = uuid.uuid4().hex[:12]
        self.name = name
        self.role = role
        self.description = description
        self.status = AgentStatus.IDLE
        self._inbox: asyncio.Queue[Message] = asyncio.Queue()
        self._team: Any | None = None  # set by AgentTeam when added

    def __repr__(self) -> str:
        return f"Agent(name={self.name!r}, role={self.role.value}, status={self.status.value})"

    # --- public API ---

    async def start(self, context: dict[str, Any] | None = None) -> Any:
        """Run the agent's main logic."""
        self.status = AgentStatus.RUNNING
        logger.info("Agent %s started", self.name)
        try:
            result = await self.execute(context or {})
            self.status = AgentStatus.IDLE
            return result
        except Exception:
            self.status = AgentStatus.ERROR
            logger.exception("Agent %s encountered an error", self.name)
            raise

    async def send(self, recipient: str, content: Any, message_type: str = "default") -> None:
        """Send a message to another agent in the same team."""
        if self._team is None:
            raise RuntimeError(f"Agent {self.name!r} is not part of a team")
        msg = Message(
            sender=self.name,
            recipient=recipient,
            content=content,
            message_type=message_type,
        )
        await self._team.deliver(msg)

    async def receive(self) -> Message:
        """Wait for the next incoming message."""
        return await self._inbox.get()

    async def receive_nowait(self) -> Message | None:
        """Return the next message if available, else None."""
        try:
            return self._inbox.get_nowait()
        except asyncio.QueueEmpty:
            return None

    # --- hooks for subclasses ---

    @abstractmethod
    async def execute(self, context: dict[str, Any]) -> Any:
        """Main agent logic. Override in subclasses."""

    async def handle_message(self, message: Message) -> None:
        """React to an incoming message. Override for custom behaviour."""
        logger.debug("Agent %s received: %s", self.name, message)
