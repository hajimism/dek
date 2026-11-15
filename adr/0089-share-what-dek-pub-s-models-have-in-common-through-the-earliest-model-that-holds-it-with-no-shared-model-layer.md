# 89. Share what dek.pub's models have in common through the earliest model that holds it, with no shared model layer

Date: 2026-11-15

## Status

Accepted

## Context

dek.pub's code is kept by model, in the order common, person, shell, deck, comment: each imports only those before it, and `src/common/` knows no model (ADR 50). ADR 88 put a decision in the plain file of the model whose rule it is, and only what knows no model in `src/common/`.

Some things were then written more than once, because no file seemed theirs:

- Whoever a rule is asked about, an account or no one, was declared as `Caller` in two files and written out four more times in `comment/access.ts` and the comment store.
- A grant's role and side were types of `deck/grant/type.ts` alone, as the protocol exported them only as zod schemas, so the comment model took them from the deck's grant folder.
- Six routes found the deck their `:id` names and refused anyone but its owner, each with `ownedDeck(c.req.param("id") ?? "", …)`; resolving, reopening and sharing a thread began with the same three lines; four places threw the 401 of a request that names no one by hand.

A shared layer under the models, `src/model/common/`, was weighed as their home.

## Decision

**No shared model layer.** What models have in common goes in the earliest model that holds it, which every later one may import already; what knows no model goes in `src/common/`.

- `Caller` is a type of `person/type.ts`, beside `Account` and `Person`, and every rule that asks about someone takes it.
- `GrantRole` and `GrantSide` are types the protocol exports beside its schemas, as `Grant` is; `deck/grant/type.ts` keeps only the row and the grantee.
- `ownedDeck(c, person)` reads the route's `:id` itself, as `requestedDeck(c, person)` does.
- `threadToChange(c, person, change)`, in the comment store, finds the thread a route names and refuses anyone who may not make the change, for resolving, reopening and sharing it.
- `signedOut(message, hint)` is beside `notFound` in `src/common/api-error.ts`.

**Rejected:**

- **`src/model/common/`, under person.** Each candidate already had a home. `Caller` is a person; a grant's role and side are the protocol's; who may read or write a deck's comments is built on who manages the deck (`canManage`), so moving those rules under person would move the deck's own rules with them. A layer that held only what was moved to fill it would be one more place to look.
- **Moving the deck's and the comments' rules into one table.** They are already pure and in order; what they lacked was a test over every visibility, role and side, which needs no move.

## Consequences

- A new rule about someone takes `Caller` from the person model; a new route on a deck its owner manages takes `ownedDeck(c, person)`; a new change to a thread is one more key of `ThreadChange`.
- The comment model imports one more function from the deck's store, `requestedDeck`, which the order allows.
- Something shared by person and a later model that is not a person would still have no home but `src/common/`, where it may not name a model. None is known; if one comes, this is the decision to supersede.
