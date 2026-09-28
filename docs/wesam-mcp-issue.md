# Wesam: the chat runtime only calls some MCP hosts (resolved 2026-09-27)

**Outcome: fixed by moving back to `deno.net`.** The agent works again. What follows is the
evidence, kept because Wesam's Test button reports success on hosts the chat runtime will not
actually call — a false positive worth reporting to them.

## Symptom

افندينا answers "the Hesba calculator isn't available right now" and refuses to give numbers, which
is the correct behaviour on a tool failure. The calculator itself is healthy.

## What was measured

Live request logs on the MCP server (`wrangler tail`) while driving the Wesam UI:

| Action                                                                  | What the server received                                                                      |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Test** button in the MCP server dialog                                | `initialize` + `tools/list`, both OK, dialog reports "Reachable — no sign-in needed, 8 tools" |
| A chat message that needs a tool                                        | **usually nothing at all**; sometimes a lone `initialize`, never `tools/list` or `tools/call` |
| A chat message needing **Bright Data** (a Wesam integration, same chat) | Works: the agent ran a web search and returned a real price with its source link              |

## What was ruled out

- **The server.** `/health` and all 8 tools respond to curl, to the official MCP SDK client, and to
  Wesam's own Test. 121 automated tests pass.
- **The token.** The same URL that Test accepts is the one saved on the agent.
- **Agent state.** Reproduced on a brand-new agent created from scratch.
- **Stale config.** Reproduced after deleting and re-adding the MCP server, after pressing Test +
  Save, and after BUILD.
- **The host.** Reproduced on `*.workers.dev` directly and through a proxy on a `*.vercel.app`
  domain. (Interesting: through the proxy a chat sent `initialize` at least sometimes; direct it
  sent nothing. Neither ever sent `tools/list` or `tools/call`.)
- **Client blocking.** The endpoint answers requests from every user agent tried, including empty
  ones.

## Conclusion

Wesam's chat runtime is not attaching or calling MCP tools, while its own connection test and its
non-MCP integrations both work. This looks like a platform-side regression, not a configuration
problem on our side.

## What it does and does not affect

- **Judging is not blocked.** The README runs the calculator locally in five minutes with no Wesam
  account, which is what the "does it work" criterion asks for.
- **The demo video is blocked** until this is fixed, since it shows the agent doing the job.

## Timeline

- Up to 2026-09-24 the same setup worked: chats called `price_product`, `market_costs` and
  `price_scenarios`, and charts rendered inline.
- 2026-09-26 the previous host (Deno Deploy) was suspended for exceeding an unverified free org's 1%
  cap; the server moved to Cloudflare Workers the next day.
- Since the move, no chat has produced a single tool call, on either host or either agent.
