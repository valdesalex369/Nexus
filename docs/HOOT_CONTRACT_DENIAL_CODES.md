# Hoot Contract Denial Codes v0.1

Purpose: make Hoot mission refusal deterministic and inspectable before runtime routing is implemented.

A mission must be denied when any rule below applies. The first applicable rule in this order is the primary denial code; additional matches may be recorded as secondary evidence.

| Code | Condition | Required behavior |
|---|---|---|
| `DENY_SCHEMA_INVALID` | Mission fails the versioned mission schema. | Do not route or execute. Record validation evidence. |
| `DENY_AGENT_MISMATCH` | Mission agent is not Hoot. | Do not route to Hoot. |
| `DENY_AUTHORITY_CLASS` | Requested authority is outside `REVERSIBLE_INTERNAL`. | Stop before execution. |
| `DENY_CAPABILITY` | Any requested capability is outside Hoot's allowlist. | Do not partially execute the mission. |
| `DENY_STEP_BUDGET` | `max_steps` exceeds the active Hoot contract. | Reject rather than silently widening budget. |
| `DENY_TOOL_BUDGET` | `max_tool_calls` exceeds the active Hoot contract. | Reject rather than silently widening budget. |
| `DENY_RECURSION_BUDGET` | recursion depth exceeds the active Hoot contract. | Reject before recursion begins. |
| `DENY_COST_BUDGET` | Known estimated cost exceeds the active contract's permitted cost. | Stop at the cost gate. Unknown cost remains unknown and requires policy evaluation; it is never assumed free. |
| `DENY_HUMAN_GATE` | Mission entails spending, financial-account/wallet connection, trading/asset movement, external communication/publication, credential/permission change, destructive action, material deployment, or representation of the user to a third party. | Preserve completed reversible work and request only the minimum human action when interactive. |
| `DENY_EVIDENCE_REQUIREMENT` | Mission cannot produce evidence sufficient to evaluate its declared success criteria. | Do not permit a PASS classification. |

## Routing invariant

`ALLOW` is valid only when every requested capability is explicitly allowlisted, every numeric limit is within contract bounds, the authority class matches, no human gate applies, and the mission is structurally valid.

Absence of a denial is not evidence of success; it is only permission to enter the bounded execution stage.

## Stable-result shape

A future deterministic router should return a structure equivalent to:

```json
{
  "decision": "ALLOW | DENY",
  "primary_code": "ALLOW | DENY_*",
  "secondary_codes": [],
  "mission_id": "...",
  "agent": "Hoot"
}
```

The same mission plus the same active contract must produce the same routing decision and codes.