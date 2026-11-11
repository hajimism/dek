# Agent eval results

[日本語](./README.ja.md)

Each file here is one record of the agent eval, kept so that how well an agent works with dek can be compared from one release to the next. Make one once the release commit is in, from a checkout of it:

```bash
bun scripts/agent-eval.ts --runs 3 --record evals/agent/results
```

and commit the file it writes, `<date>-v<version>.json`, as it is. The date is the day the eval started in UTC, and the version is package.json's, which only the release pull request bumps: a record made before that commit carries the previous release's version. A second record on the same day and version gets `-2`, `-3`, and so on, never overwriting the first.

A record keeps the commit it measured, `commit` (`git rev-parse --short HEAD`, or null outside a git checkout), and, for each scenario, how many runs were made, passed, and skipped, the median time, `dekc` runs, repeats, errors left, and warnings left, and the errors dek showed without a hint, over all runs. A run whose final lint printed no list of diagnostics counts as one error left, and is left out of the warnings left, which are null when no run's lint could look. It keeps no paths, transcripts, or anything the agent wrote; those stay in the full report under `.cache/agent-eval/`.

One run is an anecdote: an agent that passes once may fail the next time. Read a record of three runs or more, and compare records made with the same agent on the same kind of machine: the fonts a machine has change how lines break, and so what DEK035 and DEK036 find. A record names neither the agent nor the machine, so say which agent, its version, and the machine in the commit message.
