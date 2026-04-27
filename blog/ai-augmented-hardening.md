# Building Small, Secure Infrastructure for Event Processing

## How RO IT Systems hardened its public website and private message-ingestion stack

We cannot always talk about what we do for clients.

That is the nature of serious consulting work. The most valuable engagements often involve sensitive architecture, operational risk, governance gaps, internal platforms, security posture, AI readiness, data protection, or leadership decision-making that belongs to the client — not to us.

So, in the spirit of transparency, this post does something different.

Instead of describing client work, it walks through how we hardened part of our own infrastructure: the public RO IT Systems website and the private message-ingestion system behind it. This gives prospective clients a practical view of how we think, how we work, and what “secure enough to operate” means in a real, small, owned system.

This is not a grand enterprise platform. That is the point.

It is a focused example of responsible engineering: take a simple public interaction, reduce the attack surface, protect private services, validate inputs, store messages durably, process events asynchronously, document operations, and leave room for future automation without overbuilding.

## Executive summary

This kind of hardening exercise is not just a technical cleanup. It is an executive risk-control exercise.

For senior leadership, the outcome is a system that is easier to trust, easier to operate, and easier to explain.

It provides reduced exposure by keeping databases, brokers, and internal services off the public internet; clearer accountability through documented architecture, deployment, backup, restore, and operating procedures; stronger privacy posture by limiting where personal information flows and avoiding secrets in code or logs; improved resilience through durable storage, asynchronous event processing, retries, health checks, and graceful failure paths; better governance because security expectations are translated into concrete engineering controls; faster delivery with lower ambiguity because AI-assisted coding is guided by explicit standards and acceptance criteria; and a foundation for future automation, such as admin workflows, notification bots, CRM routing, or mobile review, without surrendering control to unnecessary third-party platforms.

The leadership value is not that the stack is exotic. It is that the system is understandable, bounded, documented, and aligned with operational risk.

That is what responsible technical delivery should provide: confidence that the organization can move quickly without losing control of its data, its systems, or its obligations.

## The problem

Most small business websites do one of two things with contact forms.

They either send an email directly, or they hand the whole problem to a third-party form platform.

That works until you care about privacy, operational control, resilience, observability, and what happens next.

For RO IT Systems, the problem was simple: we needed secure, lightweight event processing without relying on third-party platforms. The public website needed a clean contact experience. The backend needed to receive messages, store them durably, process them asynchronously, and remain small enough to run affordably on a single DigitalOcean droplet.

The result was `roitsystems-infra`: a private message-ingestion infrastructure using Caddy, CouchDB, NATS JetStream, a Node.js/TypeScript API, and a worker service.

The build brief described the goal as creating a private RO IT Systems message-ingestion infrastructure on DigitalOcean, using CouchDB as durable NoSQL storage and NATS JetStream as the lightweight event broker.

This was also an exercise in applied AI-assisted delivery. The security and hardening prompt came from my consulting project in ChatGPT, where I maintain patterns and standards for platform hardening. Copilot Studio then implemented the code changes.

The human role was not replaced. It shifted upward: architecture, constraints, review, security judgment, and operational intent.

## What the old contact form could not do

The old contact form was good enough for a static website. It opened a prepared email.

That was simple, but it had limits: no durable message record, no event stream, no processing status, no private mobile-friendly admin view, no clean path to future notification bots, and no structured security boundary between public website and backend.

The goal was not to build an enterprise service bus.

The goal was to build a small, owned, inspectable system that could do one thing well.

Accept an inquiry. Store it. Publish an event. Process it. Keep the private systems private.

## What we needed

```mermaid
flowchart LR
    Visitor[Website visitor] -->|HTTPS POST /api/contact| Proxy[Caddy reverse proxy]
    Proxy --> API[Node.js / TypeScript API]
    API -->|Validated document| Couch[(CouchDB)]
    API -->|contact.messages.new| NATS[NATS JetStream]
    NATS --> Worker[Worker service]
    Worker -->|Status update| Couch
    Worker --> Notify[Future notification hook]