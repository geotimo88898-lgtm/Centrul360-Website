const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
(async () => {
  const jobs = JSON.parse(fs.readFileSync('jobs.json')); const b = await chromium.launch();
  for (const [name, svg, px] of jobs) {
    const S = px * 8, p = await b.newPage({ viewport: { width: S, height: S } });
    await p.setContent('<html><body style="margin:0;background:transparent">' + svg.replace(/width="\d+" height="\d+"/, `width="${S}" height="${S}"`) + '</body></html>');
    await p.screenshot({ path: 'big-' + name, omitBackground: true, clip: { x: 0, y: 0, width: S, height: S } }); await p.close();
    execSync(`python3 -c "from PIL import Image; Image.open('big-${name}').resize((${px},${px}), Image.LANCZOS).save('/home/user/centrul360-website/brand_asset/brand/${name}', optimize=True)"`);
  }
  await b.close();
})();
