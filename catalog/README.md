# Catalog de rezultate — Centrul360 (print, A4 landscape)

Catalog printabil cu rezultate înainte/după, un caz pe pagină, variantă **pe alb** a identității vizuale a site-ului (Inter + Fraunces, aceleași pastile/badge-uri, accent auriu).

## Structură

```
catalog/
  catalog.html                    ← sursa (editează AICI)
  build_pdf.py                    ← generează PDF-ul din catalog.html
  Catalog-Rezultate-Centrul360.pdf ← output, A4 landscape, gata de print
  fonts/                          ← Inter + Fraunces, local (nu depinde de internet la export)
  images/                         ← pozele înainte/după, câte una pe caz
```

## Cum adaugi un caz nou

1. Pune poza (colajul înainte/după, ideal ~2000×1414px sau orice raport apropiat de A4 landscape) în `images/`, ex: `images/caz-02-nume.png`.
2. Deschide `catalog.html` și copiază tot blocul `<section class="page case">...</section>` al Cazului 01.
3. Lipește copia **înainte** de secțiunea finală (`class="page closing"`).
4. Completează:
   - `images/...` — calea către poza nouă
   - „Cazul 0N"
   - titlul tratamentului (`<h2>`)
   - badge-urile: locație (Timișoara / Arad), număr ședințe, tehnologie
   - paragraful descriptiv
   - `01 / 0N` din header-ul fiecărei pagini (actualizează totalul pe toate paginile de caz)
5. Rulează:
   ```bash
   python3 build_pdf.py
   ```
   Regenerează `Catalog-Rezultate-Centrul360.pdf`.

## Note

- Fiecare poză e afișată static (așa cum e trimisă), fără slider — potrivit pentru poze deja montate înainte/după alăturat.
- Publică doar poze pentru care ai acordul scris al clientei (menționat deja în disclaimer-ul de subsol al fiecărei pagini de caz).
- Dacă ai un citat real al clientei, îl poți adăuga decomentând blocul `<!-- citat opțional -->` din pagina cazului respectiv — nu adăuga citate inventate.
- Fiecare pagină are 18mm liberi pe muchia stângă (`--gutter`), pentru perforare + îndosariere.
  Pe paginile de caz, poza are `width:176mm; margin-left:var(--gutter)` (lățime fixă în mm, nu %) —
  **nu** folosi padding pe `.page` pentru asta: motorul de print al Chromium îl ignoră silențios pe
  muchia stângă la export PDF, deși arată corect pe ecran. Dacă adaugi un nou tip de pagină, verifică
  gutter-ul mereu în PDF-ul generat (ex. cu `pymupdf`), nu doar în previzualizarea din browser.
