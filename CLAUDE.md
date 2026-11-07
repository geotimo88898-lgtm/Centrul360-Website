# Centrul360: site, portal (admin) și api

## Găzduire: doar Cloudflare (decizia proprietarului, 7.11)
- Totul rulează pe Cloudflare: un singur Worker (`wrangler.jsonc`, `cf/worker.js`, build `cf/build.mjs`), fișierele în R2.
- **Vercel nu se mai folosește deloc.** Nu publica, nu configura și nu verifica nimic pe Vercel (`vercel.json` și `middleware.js` au rămas doar pentru că Workerul le citește).
- A publica = push pe `main` (Cloudflare Workers Builds). Verificarea: scrii `date +%s` în `deploy-mark.txt`, push, apoi aștepți să apară la https://www.centrul360.com/deploy-mark.txt sau https://admin.centrul360.com/deploy-mark.txt.
- Ceasul automatizărilor e Cron-ul Workerului (`"17 * * * *"`, `cf/worker.js` scheduled): automatizările în fiecare oră, creativele la 05 UTC, raportul la 19 UTC. Ultima rulare: https://admin.centrul360.com/api/clock-status . Workflow-ul de pe GitHub rămâne doar pentru pornire manuală.

## Reguli
- Proprietarul scrie în română: răspunsuri în română, scurt, fără liniuțe lungi (em sau en dash), nicăieri.
- Repo public: fără nume de cliente, telefoane, cifre de business sau chei în cod, commituri sau loguri.
- Doar date reale (recenzii, rezultate înainte/după, prețuri din Admin → Oferte). Nimic inventat.
- Site-ul nou e în `v2/` (vezi `v2/README.md` și `REDESIGN.md`), în previzualizare, până spune proprietarul că trece în locul celui vechi.
