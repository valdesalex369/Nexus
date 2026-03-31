# Nexus
AI Agents and Social Media Automation

## Agent Teams

Nexus supports **agent teams** — groups of cooperating AI agents that can run in parallel, sequentially, or as a pipeline where each agent's output feeds into the next.

### Quick Start

```python
import asyncio
from nexus.agents.social import ContentCreatorAgent, SchedulerAgent, ModeratorAgent
from nexus.teams.team import AgentTeam

async def main():
    team = AgentTeam("my-team")
    team.add(ContentCreatorAgent())
    team.add(SchedulerAgent())
    team.add(ModeratorAgent())

    # Run all agents in parallel
    results = await team.run_all({"topic": "AI", "platforms": ["twitter"]})

    # Or run as a pipeline (output of one feeds into the next)
    output = await team.run_pipeline(initial_input={"topic": "AI", "platforms": ["twitter"]})

asyncio.run(main())
```

### Built-in Agents

| Agent | Role | Description |
|-------|------|-------------|
| `ContentCreatorAgent` | Content Creator | Generates social media posts |
| `SchedulerAgent` | Scheduler | Schedules posts for optimal engagement |
| `AnalyticsAgent` | Analyst | Tracks engagement metrics |
| `ModeratorAgent` | Moderator | Reviews content for policy compliance |

### Custom Agents

```python
from nexus.agents.base import Agent, AgentRole

class MyAgent(Agent):
    def __init__(self):
        super().__init__(name="my-agent", role=AgentRole.CUSTOM)

    async def execute(self, context):
        # Your logic here
        return {"result": "done"}
```

### Configuration

Set via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXUS_TEAMS_ENABLED` | `true` | Enable/disable agent teams |
| `NEXUS_MAX_AGENTS_PER_TEAM` | `10` | Max agents per team |
| `NEXUS_MESSAGE_TIMEOUT` | `30` | Message delivery timeout (seconds) |
| `NEXUS_PARALLEL_EXECUTION` | `true` | Allow parallel agent execution |
| `NEXUS_LOG_LEVEL` | `INFO` | Logging level |

### Run the Demo

```bash
python -m nexus.main
```
