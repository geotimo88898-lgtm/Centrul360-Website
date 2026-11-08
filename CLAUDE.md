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
- Site-ul nou e live din 7.11. Sursele sunt în `v2/src/` (vezi `v2/README.md`): `python3 v2/build.py` face previzualizarea la /v2, iar `python3 v2/swap.py --apply` scrie paginile live, doar după „da”-ul proprietarului pe previzualizare.

## Reclamele Meta (regula proprietarului, 8.11)
- Ai acces și control deplin la reclamele Meta ale Centrul360, prin admin, doar pe pagina Centrul360 și pe campaniile ei: în contul „centru pls” (act_4502494523405059), campaniile care nu încep cu ARANCA sau BRAZI (ale celorlalte afaceri din același cont; Summitlane are contul lui).
- Când proprietarul spune că vrea o reclamă, alegeți împreună creativele, apoi o publici singur, fără alte aprobări.
