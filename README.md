# Instruction Fidelity

Code review checks if the code is good. It doesn't check if the agent
actually did what you asked. This does.

Built for AGI House SF's AI for Trust and Safety hackathon challenge
("Catch what the loop misses"): agents oversell what they did, and drift
mid-session from what they said they'd do — and no review tool checks either,
because they only ever see the final diff, never the transcript that produced it.

## What it checks

Three comparisons, all against the full session transcript (not just the diff):

1. **Instruction → Plan** — did the agent's stated intent honor the latitude of what was asked.
2. **Plan → Action** — did the agent's actual edit match what it said, moments earlier, it would do.
3. **Claim → Execution** — did the agent's final summary match what its own recorded tool calls actually show happened.

Verification is deterministic wherever the transcript has a checkable fact
(a real test exit code, a literal file/symbol match) and falls back to a
narrowly-scoped LLM judgment only for the genuinely ambiguous remainder —
which is labeled as a judgment call in the UI, not presented as a fact.

## Running it

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Click **Analyze** to run against the current
repo's git diff and the most recent Claude Code transcript for this project,
or push a session live from Claude via the MCP server below.

Set `ANTHROPIC_API_KEY` in `.env.local` for the tier-3 LLM judgment calls and
the "Suggest Fix" action to work.

## MCP server

`.mcp.json` registers an `instruction-fidelity` MCP server (`mcp/server.ts`,
run via `tsx`) exposing three tools to Claude:

- `push_transcript` — analyzes the current session + repo and pushes the result live to the dashboard.
- `explain_claim` — grounded, cited explanation of why a specific claim is verified/contradicted/unchecked.
- `list_unverified` — the gap list an approver should read before signing off.

Restart Claude Code (or reconnect MCP servers) after cloning so it picks up `.mcp.json`.

## Live mode

`.claude/settings.json` registers a `PostToolUse` hook that POSTs every
Edit/Write/NotebookEdit call to `/api/live-ingest`, so the dashboard updates
while an agent is still working — not just after the session ends.
