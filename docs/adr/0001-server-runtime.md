# ADR 0001: Server Runtime

## Status

Accepted for v0.

## Context

The framework needs a single server that can:

- serve a Vite-powered client-only React app,
- dispatch `app/api/**/route.ts` files with `GET`, `POST`, and other method exports,
- expose standard `Request` and `Response` semantics,
- provide RPC-agnostic mounts,
- run in Node and, where feasible, Bun.

Nitro was evaluated because it ships full-stack Vite app support, file-based server routing, deployment presets, static assets, and a renderer that can serve an SPA fallback.

## Decision

For v0, use a minimal framework-owned server layer rather than depending on Nitro.

## Rationale

Nitro is a strong fit for server deployments, but its native routing convention is not the public convention this framework is trying to prove. The v0 framework should own the Next-inspired `app/api/**/route.ts` method-export API, the generated client route manifest, and the RPC-agnostic `mount(path, handler)` API without translating those concepts through another framework's route model.

The implementation still follows the same broad direction as Nitro: web-standard handlers, one server, static asset serving, SPA fallback, and runtime portability as much as possible.

## Consequences

- The v0 server has less deployment-provider coverage than Nitro.
- The framework API remains small and direct.
- Nitro can be reconsidered later behind the same public API if deployment presets become more important than owning the server internals.

