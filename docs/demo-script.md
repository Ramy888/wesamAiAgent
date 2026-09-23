# Demo video — script and shot list (target 2:30, max 3:00)

**Format:** screen recording of the Wesam chat plus the landing page. **Voice-over:** Egyptian
Arabic, with burned-in English subtitles. **Recording:** 1920×1080, browser zoom 110%, one clean
Wesam workspace, notifications off.

**Numbers:** use only real Bya3 output recorded on the day, never typed-in numbers. The example
numbers below come from the tested calculator; re-record if any number differs.

| # | Time      | Shot (screen)                                                                                                                                             | Voice-over (Egyptian Arabic)                                                                                                   | Subtitle (English)                                                                                                                    |
| - | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | 0:00–0:12 | A seller's messy Excel sheet, a Facebook Ads Manager screenshot, a courier report                                                                         | «كل بياع أونلاين بيسأل نفس السؤال: أنا كسبان ولا بخسر؟ والإجابة متوزعة بين شيت وإعلانات وشركة شحن.»                            | Every online seller asks: am I making money? The answer is scattered across sheets, ads and courier reports.                          |
| 2 | 0:12–0:20 | Landing page hero (hesba-ten.vercel.app)                                                                                                                  | «حِسبة… وبيّاع، محلل التسعير بتاعك على Wesam.»                                                                                   | Meet Hesba, and Bya3, your pricing analyst on Wesam.                                                                                  |
| 3 | 0:20–1:00 | Wesam chat. Type a pricing request in Arabic (cost, shipping, CPA, CR, DR, price 300). The reply appears: verdict, numbers, **cost chart**                | «بكتب أرقامي بالمصري… في ثواني: قراري، مكسبي الحقيقي في الأوردر، وأقصى تكلفة ليد أقدر أدفعها… والرسم بيوريني فين فلوسي بتروح.» | I type my numbers. In seconds: a verdict, my real profit per order, the most I can pay per lead, and a chart of where the money goes. |
| 4 | 1:00–1:35 | Campaign check: paste a week's numbers (budget, leads, confirmed, delivered). Verdict **PAUSE/FIX**, funnel chart, top lever                              | «مراجعة حملة الأسبوع: بيّاع بيقولي وقّف ولا صلّح ولا كبّر… وإيه أهم خطوة.»                                                         | Weekly campaign check: pause, fix or scale, and the one move that matters.                                                            |
| 5 | 1:35–2:05 | Competitor check: "مكواة بخار محمولة in Egypt". Bya3 finds real offers, asks to confirm, then shows the **market chart** and the "don't undercut" verdict | «وكمان بيدوّر على المنافسين بنفسه، بياخد موافقتي، ويقولي: متنزلش سعرك… اعمل باكدج.»                                             | It finds competitors itself, asks me to confirm, then tells me: don't undercut, bundle instead.                                       |
| 6 | 2:05–2:20 | Bundle offer check ("2 for 550") → profit per order + bundle chart                                                                                        | «وأي عرض قبل ما أنزله… أعرف هيكسب ولا هيخسر.»                                                                                  | Any offer, checked before I launch it.                                                                                                |
| 7 | 2:20–2:40 | Impact slide (real seller numbers, see `impact-slides.md`)                                                                                                | «مع [اسم البياع]: وفّرنا [X] ساعة في الأسبوع ووقفنا [Y] جنيه كانوا رايحين في إعلانات خسرانة.»                                   | With [seller]: [X] hours saved a week, [Y] EGP of losing ad spend stopped.                                                            |
| 8 | 2:40–2:50 | Logo + landing URL + "Built on Wesam.ai"                                                                                                                  | «حِسبة… اعرف مكسبك الحقيقي قبل الإعلان الجاي.»                                                                                  | Hesba: know your real profit before the next ad.                                                                                      |

## Prompts to use (copy exactly)

1. **Pricing:**
   > عايز أسعّر منتج في مصر. التكلفة 100 جنيه + جمارك 10، الشحن 25 والمرتجع 15، تغليف 5 وتجهيز 10،
   > كول سنتر 2 و SMS نص جنيه لكل ليد. عمولة المنصة 8% وبوابة الدفع 2.5% + 3 جنيه، ضريبة 15% وعمولة
   > مسوّق 3%. الـ CPA عندي 15، التأكيد 60% والتسليم 45%، وببيع بـ 300 وعايز هامش 10%.

   **Expected:** below target; net profit 2.19 EGP (0.7%); breakeven 296.94; suggested price 345.23.
2. **Campaign:** use the seller's real week, or this sample:
   > المنتج ده بسعر 300، الأسبوع ده صرفت 1000 جنيه، جالي 100 ليد، 50 أكدوا و40 استلموا. الهدف 20%.

   **Expected with the same fees:** FIX; net profit +880 EGP (7.3%, target 20%); top lever: raise
   the price to 373.79.
3. **Competitors:**
   > نفس التكاليف دي، المنتج "مكواة بخار محمولة" وببيعها في مصر بـ 300. شوفلي المنافسين بيبيعوها
   > بكام وقارن سعري بيهم. بحث واحد و4 صفحات بالكتير.
4. **Offer:**
   > نفس المنتج: لو عملت عرض قطعتين بـ 550 هكسب ولا هخسر؟

   **Expected:** +70.94 per order (12.9%).

## Recording checklist

- [ ] The server URL in Wesam has the **new token**, and the connection test passes.
- [ ] Bright Data credits are available; the monthly caps are set (they are).
- [ ] Record each segment separately and cut them together. Wait time is sped up ×4 and labelled
      "sped up".
- [ ] Show **no** secrets: no `.env`, no server URL, no Wesam MCP dialog.
- [ ] Charts are visible for at least 3 seconds each.
- [ ] The final cut runs 2:30–2:50, with subtitles checked against the audio.
