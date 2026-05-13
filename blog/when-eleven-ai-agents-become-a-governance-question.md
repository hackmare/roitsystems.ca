# When Eleven AI Agents Become a Governance Headache

AI adoption usually looks smaller than it is.

One executive uses a chatbot to draft correspondence. A developer adds an agent to accelerate coding. A policy team uses AI to summarize reports. A vendor quietly turns on an AI feature inside a platform that already handles operational data. Somebody gives disk access to a helper copilot.

Each use may feel practical, even harmless. Together, they can become an unmanaged AI environment.

That is the governance lesson in RO IT Systems founder Morgane Oger's analysis, ["Eleven Agents in the Background"](https://morganeoger.ca/2026/05/13/eleven-agents-in-the-background/), which examines Vancouver Mayor Ken Sim's public statement that he has eleven AI agents running in the background doing much of his work. The article focuses on the public-sector implications: privacy law, cross-border data exposure, public accountability, and the gap between Canada's sovereign AI ambitions and the US-based tools many leaders use today.

For organizations, the broader lesson is simple: AI risk does not wait for a formal AI program.

If a tool touches personal information, confidential records, regulated workflows, public services, procurement, legal analysis, employment decisions, security operations, or code that connects to production systems, it is no longer just a productivity experiment. It is part of the organization's control environment.

That means leaders need answers to practical questions:

- What AI tools are being used?
- What data do they touch?
- Where is that data processed?
- Who can see prompts, outputs, logs, and files?
- Can the AI system take action, or only assist a human?
- Is there a privacy, security, and operational record of the decision?

Good AI governance starts with visibility. Before policies become elaborate, organizations need an AI inventory, a risk classification model, data-use rules, approval paths, human review for consequential uses, and evidence that can survive audit, board review, regulator scrutiny, or public questioning.

This is especially important for agentic AI. If allowed to by configuration and the topology, agents can read files, call tools, write code, trigger workflows, and connect systems that were never designed with AI in mind. The risk is not only what the model decides. It is also how we allow the agent to interact with the world in which it exists. It is what the surrounding system allows it to do, and the prudent enterprise treats each AI agent like a human user with inadequate corporate conduct training: with suitably least-privileged access profile.

Case in point: OpenClaw.

OpenClaw's own documentation points to one practical control: put network access behind an operator-managed boundary. Its [network documentation](https://docs.openclaw.ai/network) describes a gateway model that defaults to local loopback and requires an authentication path for non-loopback access. Its [network proxy guidance](https://docs.openclaw.ai/security/network-proxy) describes routing runtime HTTP and WebSocket traffic through an operator-managed forward proxy for central egress policy, destination filtering, SSRF protection, and audit logs. That does not replace identity controls, sandboxing, data classification, or human review, but it gives organizations a place to enforce and observe what agents can reach.

The responsible path is not to stop AI adoption. It is to make adoption governable.

RO IT Systems helps organizations move from scattered AI use to safe, auditable adoption: inventorying tools, mapping data flows, assessing privacy and security exposure, defining controls, and building practical governance that lets teams move with confidence. [Contact RO IT Systems](https://roitsystems.ca/#contact) to accelerate your safe AI implementation.
