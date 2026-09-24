# Agent Usability Criteria

dek is built to be used by coding agents. This page is the yardstick for that: what a change must not break, and what an improvement should move. Use it when you design a command, a diagnostic, or a convention, and when you review one.

An agent works in a loop: learn the project, write a slide, check the result, fix what is wrong, and decide that it is done. Each criterion below covers one place where that loop can stall.

## Criteria

### 1. Accurate guidance

`AGENTS.md` and `dek help --agent` are enough to start working, and what they say matches the project as it is.

- A class, token, or layout that `AGENTS.md` lists exists in the theme the deck uses.
- A freshly created project already has the guidance an agent needs.
- Anything an agent must know to write correct markup, such as the structure a layout expects, is reachable from these two sources.

### 2. Conventions match checks

Every convention written for agents is enforced by a lint rule. A deck that passes lint does not violate a documented convention.

- Each convention in `AGENTS.md` maps to a rule id.
- A convention that cannot be checked is either made checkable or removed from the list.
- The documented behavior of a rule, including its severity, is the behavior of the code.

### 3. Verifiable output

An agent can check what it rendered without a human looking at it.

- Anything geometry can decide, such as overflow and contrast, is a diagnostic rather than a screenshot to interpret.
- Screenshots, transition frames, and the slide currently on screen are available on request.
- A check that was skipped is reported as skipped, never as a pass.

### 4. Actionable diagnostics

Every diagnostic tells the agent where the problem is and what to do next.

- The location is exact: the file that has to change, and the line when there is one.
- The hint is something the agent can do as written. A command in a hint succeeds when run in the state that produced it.
- A hint does not send the agent somewhere that lacks the information it promises.
- A hint does not suggest a fix that breaks other slides.

### 5. Machine-readable results

An agent never has to parse prose to decide what to do.

- Every result command takes `--json` and returns the same envelope.
- Each diagnostic carries its severity, and the exit code follows from severity alone.
- Numbers in a diagnostic, such as pixels, contrast ratios, and the offending value, are fields, not only text in the message.

### 6. A clear definition of done

An agent can tell when the work is finished and gets there in few runs.

- A fresh project, a new deck, and the bundled sample pass lint as created.
- Lint reports every problem it can find in one run, not one at a time.
- Warnings are reported without failing the run. Only errors mean "not done".

### 7. Safe operations

Commands that change files work from any state an agent naturally reaches, and leave nothing half done.

- A command works whichever file the agent edited first.
- A command that fails changes nothing.
- Input is validated when it is given, not when it is used later.

### 8. Consistent output

The same kind of information looks the same in every command.

- Source paths are relative to the working directory everywhere they are printed. Artifacts dek writes, such as builds and screenshots, stay absolute so they can be opened as-is.
- Tables stay aligned with CJK text.
- An error and its hint do not repeat each other.

## Severity of a violation

When a change or a bug violates a criterion, rate it by what it does to the agent.

| Severity | Effect on the agent |
| --- | --- |
| S1 | The agent gets stuck, or reports the work as done when it is not |
| S2 | The agent reaches the goal, but with extra runs or guesswork |
| S3 | Presentation only; the agent is not slowed down |

S1 violations are fixed before new features. S2 violations are fixed when the area is touched. S3 violations are fixed when convenient.
