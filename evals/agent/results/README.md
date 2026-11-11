# Agent eval results

[日本語](./README.ja.md)

Each file here is one record of the agent eval, kept so that how well an agent works with dek can be compared from one release to the next. Make one around a release, from the checkout being released:

```bash
bun scripts/agent-eval.ts --runs 3 --record evals/agent/results
```

and commit the file it writes, `<date>-v<version>.json`, as it is. A second record on the same day and version gets `-2`, `-3`, and so on, never overwriting the first.

A record keeps, for each scenario, how many runs were made, passed, and skipped, the median time, `dekc` runs, repeats, and warnings left, and the errors dek showed without a hint, over all runs. It keeps no paths, transcripts, or anything the agent wrote; those stay in the full report under `.cache/agent-eval/`.

One run is an anecdote: an agent that passes once may fail the next time. Read a record of three runs or more, and compare records made with the same agent. A record does not name the agent, so say which one, and its version, in the commit message.
