"""Built-in social media agents for Nexus."""

from __future__ import annotations

import logging
from typing import Any

from nexus.agents.base import Agent, AgentRole, Message

logger = logging.getLogger(__name__)


class ContentCreatorAgent(Agent):
    """Generates social media content based on context topics/instructions."""

    def __init__(self, name: str = "content-creator") -> None:
        super().__init__(name=name, role=AgentRole.CONTENT_CREATOR, description="Generates social media posts and content")

    async def execute(self, context: dict[str, Any]) -> Any:
        topic = context.get("topic", "general")
        platforms = context.get("platforms", ["twitter"])
        logger.info("%s: creating content for topic=%r, platforms=%s", self.name, topic, platforms)
        return {
            "topic": topic,
            "platforms": platforms,
            "drafts": [
                {"platform": p, "text": f"[Draft for {p}] Content about {topic}"}
                for p in platforms
            ],
        }


class SchedulerAgent(Agent):
    """Schedules content for publishing at optimal times."""

    def __init__(self, name: str = "scheduler") -> None:
        super().__init__(name=name, role=AgentRole.SCHEDULER, description="Schedules posts for optimal engagement")

    async def execute(self, context: dict[str, Any]) -> Any:
        pipeline_input = context.get("pipeline_input")
        drafts = pipeline_input.get("drafts", []) if isinstance(pipeline_input, dict) else []
        logger.info("%s: scheduling %d posts", self.name, len(drafts))
        return {
            "scheduled": [
                {**draft, "scheduled_time": "next optimal slot"}
                for draft in drafts
            ]
        }


class AnalyticsAgent(Agent):
    """Collects and summarises engagement analytics."""

    def __init__(self, name: str = "analytics") -> None:
        super().__init__(name=name, role=AgentRole.ANALYST, description="Tracks and reports on social media analytics")

    async def execute(self, context: dict[str, Any]) -> Any:
        platforms = context.get("platforms", ["twitter"])
        logger.info("%s: collecting analytics for %s", self.name, platforms)
        return {
            "platforms": platforms,
            "metrics": {p: {"impressions": 0, "engagement_rate": 0.0} for p in platforms},
        }


class ModeratorAgent(Agent):
    """Reviews content for policy compliance before publishing."""

    def __init__(self, name: str = "moderator") -> None:
        super().__init__(name=name, role=AgentRole.MODERATOR, description="Reviews content for policy compliance")

    async def execute(self, context: dict[str, Any]) -> Any:
        pipeline_input = context.get("pipeline_input")
        items = []
        if isinstance(pipeline_input, dict):
            items = pipeline_input.get("scheduled", pipeline_input.get("drafts", []))
        logger.info("%s: reviewing %d items", self.name, len(items))
        return {
            "reviewed": [
                {**item, "approved": True, "flags": []}
                for item in items
            ]
        }

    async def handle_message(self, message: Message) -> None:
        if message.message_type == "review_request":
            logger.info("%s: received review request from %s", self.name, message.sender)
