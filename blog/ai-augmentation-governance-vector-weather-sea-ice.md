# When Your Product Shapes Real Decisions, AI Governance Is the Product
**What shipping Arctic sea-ice forecasting in ten days taught us about AI augmentation under human accountability**

This month, RO IT Systems' Selkie Tech division shipped sea-ice forecasting in [Vector Weather](https://vector-weather.selkietech.ca/): concentration bands, a modeled ice edge, drift vectors, and ice conditions at every waypoint of a planned route, drawn daily from the Copernicus Marine global ocean model. The story behind the feature is told on the [Selkie Tech blog](https://selkietech.ca/blog/sea-ice-northwest-passage).

This post is about the part of the story that belongs here: how a safety-relevant data product gets built with AI doing much of the work — and why the governance design, not the AI, is what makes that acceptable.

Vector Weather is not a navigation system, and says so on its own chart. It is decision support: people use it to make important decisions about marine trips — whether to make a passage this week or next, whether an anchorage will still be tenable at three in the morning, whether a planned route is worth attempting at all. That single fact sets the engineering constraint that governs everything else: **the AI cannot be allowed to hallucinate, so the architecture must make hallucination structurally irrelevant.**

## Two lanes, separated by design

Every decision-support product does two different jobs. It derives facts, and it communicates them. Our rule is that AI is welcome in the second job and excluded from the first — not by policy document, but by architecture.

When Vector Weather reports 98 percent ice concentration in Amundsen Gulf, that number travelled from a satellite-assimilated physics model through deterministic code to the screen. Nothing probabilistic touched it. The viewport summary that labels conditions "dense modeled sea ice" is assembled by plain, auditable arithmetic — the source code marks it explicitly as LLM-free. Where a language model does write — turning a completed analysis into a briefing a skipper can absorb quickly — every number in that text arrives pre-computed, and the model's job is expression, not derivation.

Two controls keep the lanes separated in practice rather than in aspiration:

- **Every AI call is logged.** Prompt and response sizes are recorded on every language-model invocation, with no exceptions — and an automated test inspects the codebase and fails the build if any call site skips the logging. The control is enforced by machinery, not by memory.
- **Uncertainty is labelled at the surface.** The product tells users, on the chart itself, that ice concentration and drift are model guidance — not thickness, not ridging, not an assurance that a route is navigable. A governed product states what its data cannot say.

This is the same risk-tiering logic we describe in [AI Governance Can Still Be Fast](https://roitsystems.ca/blog/AI-Governance-Protects-Velocity.md): an AI that phrases a briefing sits in a different risk category from an AI that invents a depth. Design so the second category cannot occur, and the first becomes safe to use aggressively.

## AI wrote much of the code. A human owned every merge

The second governance question is newer, and organisations are only beginning to face it honestly: what does accountability look like when AI writes much of the software?

The sea-ice release is a concrete data point. Roughly twenty pull requests over ten days — a caching service for a global ocean model, a server-side tile renderer, incident fixes, tests — with the majority of the code written by AI coding agents. What made that velocity governable was a role, not a tool: a **technical product delivery manager** supervising the work end to end. In this delivery model, the human does not type most of the code; the human owns all of it.

In practice, that supervision looked like:

- **Nothing lands without human review.** Agents deliver through pull requests; a human reads, approves, merges, and deploys. Direct pushes to production branches are mechanically blocked, for agents and people alike.
- **Facts are verified, not vouched for.** Before release, the feature was exercised against production data — the analysis, the rendered tiles, the per-waypoint route values — and the evidence recorded in the pull requests.
- **Failures become artifacts.** When a polar edge case broke the analysis in production — a sampling grid that marched past 90° north into latitudes that do not exist — it was diagnosed from logs, filed as an issue, fixed with regression tests, and closed with a traceable pull request, the same day. Incident, evidence, correction: the loop auditors ask about, at delivery speed.
- **The tests police the rules.** Review checklists decay; continuous integration does not. The controls that matter — the LLM-logging guard, build and import smoke tests, the regression suite — run on every change.

This is what ISO/IEC 42001 and the NIST AI Risk Management Framework mean by human oversight and defined accountability, translated into working software. The frameworks do not require that humans write the code. They require that a named human can answer for it — with evidence.

## Velocity was the result, not the casualty

The uncomfortable message for organisations still treating AI governance as a brake: the controls are why this shipped in ten days, not what it shipped despite. Agents move fast when the rules are structural — when the fact lane is sealed, the logging is enforced by tests, and the merge gate is a human who knows the product. Every one of those controls was in place before the sea-ice work began, so none of it required negotiation while the work was underway.

If your organisation is putting AI in front of people who make real decisions — customers, clinicians, operators, mariners — the question is not whether to use AI. It is whether your architecture can prove which of its outputs were computed and which were composed, and whether a named human answers for the difference. That is buildable. We know because we run our own products on it.
