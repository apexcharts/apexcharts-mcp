# Skill accuracy review — agent prompt template

The authoritative "are the skill docs still accurate for the pinned library
version?" check. The mechanical pass (`npm run verify:skills`) only produces a
signal; this is the verifier that confirms it and goes beyond, because it
understands polyglot examples, untyped sub-entry points, and semantics.

## How to run

For each skill you want to review, spawn one agent (Claude Code's Agent tool, or
any LLM with file access) using the prompt below with the placeholders filled.
Run `npm run verify:skills <product>` first and paste its signal into the prompt.

Inputs you need:

- `<NPM>` / `<VERSION>` — from the skill's SKILL.md `metadata.npm` / `library_version`
- `<TYPES_PATH>` — the pinned library's type definitions, installed by
  `verify:skills` at `node_modules/.cache/skill-verify/node_modules/<NPM>/` (the
  `.d.ts` files — the source of truth for the current API surface)
- `<SKILL_DIR>` — the SOURCE skill repo you edit (a sibling checkout), e.g.
  `../apexgantt-skill`
- `<SIGNAL>` — the `verify:skills` output for this product

## Prompt

```
You are verifying whether an AI coding-skill's documentation is still accurate
for a specific pinned version of the library it documents. Read-only — do NOT
edit files. Return a structured findings report as your final message.

Library: `<NPM>`, pinned version: <VERSION>
Library's actual TypeScript type surface (source of truth for the API): read the
.d.ts file(s) under <TYPES_PATH>.

Skill docs to review (may be stale):
- <SKILL_DIR>/SKILL.md
- every file under <SKILL_DIR>/references/

Mechanical pre-signal (confirm or dismiss each, then go beyond it):
<SIGNAL>

Report where the docs are WRONG or OUTDATED for <VERSION> — things that would
make an AI generate broken code:
1. Imports/exports that don't exist.
2. Method names/signatures not in <VERSION>.
3. Option/config keys documented but absent from the current interfaces.
4. Data-shape claims that don't match the typed interfaces.
5. Anything the docs claim that the types contradict.
Ignore prose style, merely-incomplete examples, and code from OTHER libraries
(React/Vue/Angular wrappers) unless it misuses <NPM> itself.

Output ONLY:
CONFIRMED ISSUES (doc contradicts the <VERSION> types):
- <file>:<loc> — <doc says> → <<VERSION> actually has> — severity: breaking|misleading|minor
LIKELY FINE (signal dismissed):
- <item> — <why ok>
UNCERTAIN (needs human eyes):
- <item> — <what to check>
SUMMARY: <is this skill safe to pin at <VERSION>, or does it need edits first?>
```

## After the review

- CONFIRMED breaking/misleading issues → fix the docs in the skill source repo,
  then re-run the review until clean.
- Only once a skill reviews clean is its `library_version: "<VERSION>"` pin a
  defensible claim. If you can't fix the docs yet, pin to the last version the
  docs actually match instead of the latest.
- Then publish the skill, bump it in this repo, reinstall (see CLAUDE.md →
  "Version tracking").
