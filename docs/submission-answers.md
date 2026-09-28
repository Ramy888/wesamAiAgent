# Untap submission form — ready answers

Round 2 "Hackathon", deadline **3 October 2026, 11:59 PM**. Draft already open; 5 of 13 required
questions answered. Paste these, then attach the two files.

**Q3 — Agent name**

```
افندينا (Afandina) — by Hesba
```

**Q4 — In one or two sentences, what does your agent do?**

```
افندينا prices cash-on-delivery products and reviews ad campaigns for online sellers across Egypt, the Gulf and MENA: what to charge, the most they can pay for a lead, whether an offer makes money, and whether a campaign should scale, be fixed or be paused. Every number comes from a tested calculator, never from the language model.
```

**Q5 — What problem does it solve, and for whom?**

```
Cash-on-delivery sellers cannot see their own profit. They pay for the ad up front, but only collect cash if the customer answers the phone and opens the door — so returns, unconfirmed orders and return shipping quietly decide whether an order made money. Those numbers live in four places: the ads platform, the courier's sheet, the supplier invoice and a spreadsheet. The result is that a campaign which looks profitable in Ads Manager can lose money on every delivered order for weeks before anyone notices.

افندينا is built for those sellers — small online businesses in Egypt, the Gulf and the wider MENA region, mostly one or two people running products on Facebook and TikTok ads. It answers in their own dialect, asks only for what it needs, states every assumption, and gives a verdict with one action.
```

**Q6 — What kind of agent is it?** → tick **Data analysis / reporting** and **Workflow / task
automation**

**Q7 — Which tools, frameworks or models?** → tick **Anthropic (Claude)** and **Custom / from
scratch**, then in "Other (please specify)":

```
Wesam.ai (agent platform), Model Context Protocol (a custom MCP server), Deno + TypeScript, Deno Deploy, Bright Data (competitor prices)
```

**Q8 — Briefly, how does your agent work?**

```
The seller chats with افندينا on Wesam.ai. The agent collects the missing inputs, then calls the Hesba calculator — a small MCP server I wrote in Deno and TypeScript with no dependencies — which returns every number and a signed chart image.

The hard rule is that the model never does arithmetic. The calculation engine is a port of the pricing engine from a Flutter app I built earlier, checked against the original's output to four decimal places, and covered by 121 automated tests. It works per delivered order, so confirmation rates, delivery rates, returns, courier fees, packaging, platform and payment fees, VAT and ad cost are all counted.

Eight tools: price a product, a cost-per-lead table, bundles and offers, a campaign check with a SCALE / FIX / PAUSE verdict, a competitor price comparison, a whole price ladder for beginners, published courier costs per market with their sources, and a parser that reads an ad report the seller pastes from Meta, TikTok or Google in Arabic or English.

Charts are drawn by the server from its own results and signed, so a chart can never disagree with the numbers above it. Competitor prices come from Bright Data, and the seller confirms them before anything is compared.
```

**Q9 — Did you build this agent yourself?** → **Yes, entirely on my own**

**Q10 — GitHub repository (public link)**

```
https://github.com/Ramy888/wesamAiAgent
```

⚠️ **The repo must be public before you submit.**

**Q11 — Live demo or video** → add the video URL, or the landing page:

```
https://hesba-ten.vercel.app
```

**Q12 — Upload your video** → the 2–3 minute demo file. **Required, a link is not enough.** Script
and shot list: `docs/demo-script.md`.

**Q13 — Supporting documents (optional)** → upload the impact slides as PDF. Optional on the form,
but the judging criteria are about measured impact, so send them.

**Q14 — How can a reviewer run or test your agent?**

```
No account or key needed. With Deno installed:

  git clone https://github.com/Ramy888/wesamAiAgent && cd wesamAiAgent
  deno task test     # 121 tests, including parity against the original engine
  deno task serve    # then POST to http://localhost:8000/mcp/dev

The README has a ready curl command and the expected answer (a 300 EGP price that returns a net profit of 2.19 per delivered order and a suggested price of 345.23), so you can confirm the numbers yourself in about five minutes. You can also connect it to MCP Inspector or Claude Code as an MCP server.

The same server runs in production and is what the agent on Wesam.ai calls.
```

**Q15 — What was the hardest part, and what did you learn?**

```
Keeping every number out of the language model. It is easy to let a model "estimate" a margin, and impossible to defend when a seller checks it. So all arithmetic lives in tested code, the model only collects inputs and explains results, and any default it uses is shown as an assumption the seller can correct.

The second lesson came from the domain. Cash on delivery breaks the usual e-commerce maths: an order isn't revenue until someone answers the phone and opens the door. Two things I got wrong at first and fixed: orders still in transit were being counted as returns, which turned healthy campaigns into "pause" verdicts, and I had no place for the fee couriers charge to hand back collected cash.

The third was infrastructure. Researching real courier prices across nine countries showed how little is published: only Egypt, Morocco, the UAE and Saudi print anything usable, and confirmation and delivery rates are published nowhere. So the agent asks instead of assuming, and every figure it quotes carries the page it came from.
```

**Q16 — This is my own work** → **Yes**

## Before hitting Submit

1. Repo public.
2. Video recorded and uploaded (Q12 is required).
3. Slides exported to PDF and attached (Q13).
4. Re-read Q4 and Q5 — they are the first thing a judge sees.
