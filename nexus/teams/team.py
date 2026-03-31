"""Agent team orchestration."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from nexus.agents.base import Agent, AgentStatus, Message
from nexus.config.settings import Settings

logger = logging.getLogger(__name__)


class AgentTeam:
    """A team of cooperating agents.

    Agents can be run sequentially (pipeline) or in parallel, and can
    exchange messages while executing.
    """

    def __init__(self, name: str, settings: Settings | None = None) -> None:
        self.name = name
        self.settings = settings or Settings.from_env()
        self._agents: dict[str, Agent] = {}

        if not self.settings.teams.enabled:
            raise RuntimeError(
                "Agent teams are disabled. Set NEXUS_TEAMS_ENABLED=true to enable."
            )

    def __repr__(self) -> str:
        return f"AgentTeam(name={self.name!r}, agents={list(self._agents.keys())})"

    # --- agent management ---

    def add(self, agent: Agent) -> AgentTeam:
        """Add an agent to the team. Returns self for chaining."""
        max_agents = self.settings.teams.max_agents_per_team
        if len(self._agents) >= max_agents:
            raise ValueError(
                f"Team {self.name!r} already has {max_agents} agents (max)"
            )
        if agent.name in self._agents:
            raise ValueError(f"Agent {agent.name!r} already in team {self.name!r}")
        agent._team = self
        self._agents[agent.name] = agent
        logger.info("Added agent %s to team %s", agent.name, self.name)
        return self

    def remove(self, name: str) -> Agent:
        """Remove and return an agent by name."""
        agent = self._agents.pop(name, None)
        if agent is None:
            raise KeyError(f"No agent named {name!r} in team {self.name!r}")
        agent._team = None
        return agent

    def get(self, name: str) -> Agent:
        """Get an agent by name."""
        try:
            return self._agents[name]
        except KeyError:
            raise KeyError(f"No agent named {name!r} in team {self.name!r}") from None

    @property
    def agents(self) -> list[Agent]:
        return list(self._agents.values())

    # --- message delivery ---

    async def deliver(self, message: Message) -> None:
        """Deliver a message to the target agent's inbox."""
        target = self._agents.get(message.recipient)
        if target is None:
            raise KeyError(
                f"Recipient {message.recipient!r} not found in team {self.name!r}"
            )
        await target._inbox.put(message)
        await target.handle_message(message)
        logger.debug("Delivered %s", message)

    async def broadcast(self, sender: str, content: Any, message_type: str = "broadcast") -> None:
        """Send a message from one agent to all other agents in the team."""
        for name, agent in self._agents.items():
            if name != sender:
                msg = Message(
                    sender=sender,
                    recipient=name,
                    content=content,
                    message_type=message_type,
                )
                await agent._inbox.put(msg)
                await agent.handle_message(msg)

    # --- execution ---

    async def run_all(self, context: dict[str, Any] | None = None) -> dict[str, Any]:
        """Run all agents in parallel and return their results keyed by name."""
        if not self.settings.teams.allow_parallel_execution:
            return await self.run_sequential(context)

        ctx = context or {}
        logger.info("Team %s: running %d agents in parallel", self.name, len(self._agents))

        async def _run(agent: Agent) -> tuple[str, Any]:
            result = await agent.start(ctx)
            return agent.name, result

        tasks = [asyncio.create_task(_run(a)) for a in self._agents.values()]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        output: dict[str, Any] = {}
        for item in results:
            if isinstance(item, BaseException):
                logger.error("Agent error: %s", item)
            else:
                name, value = item
                output[name] = value
        return output

    async def run_sequential(self, context: dict[str, Any] | None = None) -> dict[str, Any]:
        """Run agents one by one in the order they were added."""
        ctx = context or {}
        logger.info("Team %s: running %d agents sequentially", self.name, len(self._agents))
        results: dict[str, Any] = {}
        for agent in self._agents.values():
            try:
                results[agent.name] = await agent.start(ctx)
            except Exception as exc:
                logger.error("Agent %s failed: %s", agent.name, exc)
                results[agent.name] = exc
        return results

    async def run_pipeline(self, initial_input: Any = None) -> Any:
        """Run agents as a pipeline, passing each agent's output as input to the next."""
        logger.info("Team %s: running %d agents as pipeline", self.name, len(self._agents))
        data = initial_input
        for agent in self._agents.values():
            data = await agent.start({"pipeline_input": data})
        return data

    async def stop_all(self) -> None:
        """Mark all agents as stopped."""
        for agent in self._agents.values():
            agent.status = AgentStatus.STOPPED
        logger.info("Team %s: all agents stopped", self.name)
