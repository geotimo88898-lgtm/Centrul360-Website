# Site v2: how a page is made

The owner approved the model page (`v2/src/grasime-localizata.html`, live preview at
https://www.centrul360.com/v2/grasime-localizata). Every other page is made the same way.
Read REDESIGN.md ("Stilul") and the model page source before starting.

## Build and test
- Write the page as `v2/src/<name>.html`: a meta block, then only the page's sections (no head, header, menu,
  footer or dock: `v2/src/_shell.html` adds those). Then `python3 v2/build.py <name>` writes `v2/<name>.html`.
- In the page, `{{base}}` is the preview root (`/v2/`), so internal links are `{{base}}celulita`,
  `{{base}}oferte`; `{{arrow}}` is the button arrow.
- Local server (already running): http://localhost:8360/v2/<name>. Check it with Playwright at 390x844
  (phone first) and 1440x900: wait about 4.5 s for the reveals, screenshot every screen, look at every one.
  `document.documentElement.scrollWidth` must equal the viewport width; no console errors.
- Do NOT edit `v2/kit.css`, `v2/kit.js`, `v2/src/_shell.html` or `v2/build.py` (other pages are built in
  parallel). Page-only CSS goes in a `<style>` at the top of the page source, every class prefixed with the
  page's own prefix (e.g. `.cel-`). Ask the main session for anything every page needs.
- Do not commit or push; the main session publishes.

## Rules
- Real data only, taken from the current page of the same name in the repo root (`celulita.html` etc.):
  texts, treatments, steps, FAQ, contraindications, prices of the price list, photos. Nothing invented:
  no new claims, numbers, results or promises. Meta-safe wording ("rezultatele diferă").
- Reviews: only the Google rating (5,0, 300+ recenzii Google) and these three texts, word for word, with
  these names: Maria Muntean (Timișoara) „O experiență foarte plăcută, atmosfera relaxantă, iar rezultatul a
  fost exact pe măsura așteptărilor.” · Alina Galuțiu (Arad) „O experiență minunată, d-na Andreea m-a
  abordat cu căldură și profesionalism.” · Simona-Mihaela J. (Timișoara) „Locație frumoasă, curată,
  liniștită. Domnișoara este minunată, rezultatul este vizibil.” Copy the reviews block of the model page.
- Before/after: only the real photos in `brand_asset/` (ba-*.webp, catalog/cazul-*.webp, the files the current
  page already uses). Never generated pictures.
- No long dashes (— or –) anywhere; the build refuses them. Romanian with correct diacritics (ș ț ă î â).
- Colour only on the booking button. No new colours, no boxes inside boxes, a lot of white space.
- Motion: only the kit's clean motion (below) plus the page's explainer. One easing (`var(--e)`, `var(--e2)`),
  transform and opacity only, nothing that jumps or loops fast.
- No "video în curând" placeholders (no treatment videos for now, the owner's decision).

## The components (all in kit.css / kit.js; copy the markup from the model page)
- Hero: `section.hero` > `.wrap` > `.txt` (`.pill` with the gift line, `h1[data-words]` with one `<em>` accent,
  `.lead`, `.ctas` with `.btn.book.halo` + `.btn.ghost`, `.meta` with `.trust` and `.slot[data-slot]`) and
  `.stage` (orb, rings, `.bubble`, `button.nuki[data-lines='[...]']` with one pose, `.shadow`).
  Nuki's lines: short, warm, in character, no medical claims. The bubble shows the first line.
- `.band`: the moving row of short reassurances (fără ace, fără operație, ...), real ones for this treatment.
- `.head` (+ `.left`): `.eye` label, `h2` with one `<em>`, optional `.lead`.
- `.card.proc[data-steps="a,b"]`: the explainer animation. Inline SVG (viewBox about 640x360, text at least
  17px, the model's flat palette: skin #f7efe9, fat #fdf8ef with #ead8b3 cells, muscle #f6e7e4, teal
  #14a596 / #5fd4c6 for the energy, ink #0d0f12 for the device). Animated parts get class `a` plus your own
  keyframes (prefix them, put them in the page `<style>`), 7 s loop, `animation-play-state` is handled by the
  kit (`.proc.on .a` runs). Under it `ol.psteps` with 3 steps; `data-steps` = when step 2 and step 3 start,
  as fractions of the loop. Redraw the idea of the current page's `figure.mx` ("Cum funcționează ...")
  in this clean style.
- `.cases` > `figure.case` (`.ph` + `img`, `.ph.fit` for photos that must not be cropped) + `.dots`.
- `p.scrub[data-scrub]`: the big sentence that fills in on scroll (one `<em>` at the end turns teal).
  `.say` (Nuki pose + `q` + `small`Nuki) under it.
- `.split` with `ol.tl[data-tl]` (protocol steps: `small`, `b`, `p`) and `.stick` (Nuki pose + `q`).
- Offers: `div.offers[data-offers="remodelare|faciale|epilare|all"]` (optional `data-match="regex on key or
  title"`, `data-city="timisoara|arad"`), filled live from Admin. `.card.list` for the price list rows
  (from the current page). `.card.gift` with Nuki cadou.
- Reviews: `.score` (count-up 5,0 + stars) + `.revs` with three `.card.rev`.
- `.fit` with `.card.yes` / `.card.no` lists (`li > i > svg` tick or cross, then `span`).
- `.faq` with `.q` (`button` + `.pm`, `.a > div > p`).
- `section.s.end`: Nuki big (`.stage`), h2, lead, `.btn.book.halo`, `.slot`.
- Booking buttons: `<button type="button" class="btn book" data-book data-book-service="consult">`; for a
  clinic page add `data-book-city="Timișoara|Arad"`; for an offer the slip does it itself.
- Nuki poses (brand_asset/mascota/ipostaze/*.webp): apa, aparat-foto, aprobare, arata-jos, bucurie, cadou,
  calendar, cavitatie, centimetru, ems, facial, fisa, gandeste, hifu-fata, laser, liniste, liposonix,
  mana-inima, oglinda, prezinta, receptie, salut-pa, spf, stea-google, surprins, telefon. Pick the one that
  fits the section; do not reuse the same pose twice on a page.

## The swap (only on the owner's „da”)
- `python3 v2/swap.py --out <dir>` builds the live site into a folder to test it (nothing in the repo changes);
  `python3 v2/swap.py --apply` writes it over the old pages in the site root and rewrites `sitemap.xml`.
- Same addresses as today (/, /celulita, /oferte, /termeni...), so Google keeps every page; the old pages stay in git
  history (undo = revert the swap commit). Live: no preview badge or questions, robots index (thank-you pages noindex),
  the Meta pixel and the Google tag on every page, the structured data (MedicalProcedure, MedicalBusiness).
- The script refuses to finish if a live page still links to /v2/, has the preview badge, lacks the pixel or the tag.
- Left as they are: avans-programare / avans-multumesc (the deposit flow), nou-inchis / nou-luminos, the portal.
- The owner's open questions show in the preview only (`q:` in a page's meta block, texts in `QUESTIONS` in build.py).
