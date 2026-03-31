"""Entry point demonstrating Nexus agent teams."""

from __future__ import annotations

import asyncio
import logging

from nexus.agents.social import (
    AnalyticsAgent,
    ContentCreatorAgent,
    ModeratorAgent,
    SchedulerAgent,
)
from nexus.config.settings import Settings
from nexus.teams.team import AgentTeam

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(name)s | %(message)s")
logger = logging.getLogger(__name__)


async def run_parallel_team() -> None:
    """Run all social-media agents in parallel."""
    settings = Settings.from_env()
    team = AgentTeam("social-media-parallel", settings)

    team.add(ContentCreatorAgent())
    team.add(SchedulerAgent("scheduler-parallel"))
    team.add(AnalyticsAgent())
    team.add(ModeratorAgent())

    context = {"topic": "AI automation", "platforms": ["twitter", "linkedin"]}
    results = await team.run_all(context)

    logger.info("Parallel results:")
    for name, result in results.items():
        logger.info("  %s -> %s", name, result)

    await team.stop_all()


async def run_pipeline_team() -> None:
    """Run agents as a pipeline: create -> schedule -> moderate."""
    settings = Settings.from_env()
    team = AgentTeam("social-media-pipeline", settings)

    team.add(ContentCreatorAgent("pipeline-creator"))
    team.add(SchedulerAgent("pipeline-scheduler"))
    team.add(ModeratorAgent("pipeline-moderator"))

    initial = {"topic": "Nexus launch", "platforms": ["twitter", "instagram"]}
    final = await team.run_pipeline(initial_input=initial)

    logger.info("Pipeline final output: %s", final)
    await team.stop_all()


async def main() -> None:
    logger.info("=== Nexus Agent Teams ===")

    logger.info("\n--- Parallel Team ---")
    await run_parallel_team()

    logger.info("\n--- Pipeline Team ---")
    await run_pipeline_team()


if __name__ == "__main__":
    asyncio.run(main())
