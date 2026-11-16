# qa: verificarea portalului înainte de publicare

Rulează asta înainte de fiecare publicare care atinge portalul (CSS sau JS de ecran):

```
node qa/seed.cjs                     # date false (nume lungi, sume mari), în qa/.data
node qa/server.cjs &                 # portalul local pe http://127.0.0.1:8787, fără rețea
node qa/overflow.cjs --quick         # 3 lățimi, temă închisă (câteva minute)
node qa/overflow.cjs                 # tot: 9 lățimi (360 ... 1920), închis și deschis
```

`overflow.cjs` deschide fiecare secțiune a fiecărui rol (admin, manager, recepție, cosmeticiană), sub-taburile și
sertarele principale, la telefon, tabletă și calculator, și listează ce iese din chenar: cutii care ies din cardul lor,
text tăiat fără „…”, pagină care se derulează în lateral. Iese cu codul 1 dacă găsește ceva; lista e în `qa/out/overflow.json`,
capturile în `qa/out/shots/`. Opțiuni: `--roles admin,manager`, `--tabs angajati,panou`, `--widths 360,1440`, `--themes dark`.

Regulile serverului (cifrele clinicii și cine vede ce), pe o copie proprie a datelor și alt port, deci merge lângă overflow:

```
node qa/api-checks.cjs               # neprezentări, consultații cu upsell, regula de 1.500, cine a plecat, costurile trimise,
                                     # mesaje fără răspuns, candidații, Activitate, euro, dimineața, erorile Meta, a doua citire
```

Iese cu codul 1 dacă o regulă nu se mai ține (`PORT=…`, `DATA=…` pentru altă copie; `DATA_KEEP=1` păstrează copia temporară).

