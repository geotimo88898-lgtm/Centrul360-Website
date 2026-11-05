// Mașina de creative construită pentru Cloudflare (folosit doar de cf/build.mjs, care îl pune în locul lui
// next.config.ts într-o copie de lucru a repo-ului centrul360-creative-machine; pe Vercel rămâne cel original).
// Ce diferă: fără Vercel Workflow (comenzile rulează ca Cloudflare Workflows, în cf/creative-jobs.js), iar sharp,
// @vercel/blob și workflow sunt module mici care cheamă implementările din Workerul principal (Photon, R2, Workflows).
import path from "node:path";
import type { NextConfig } from "next";

const shim = (f: string) => path.join(process.cwd(), "cf-shims", f);

const nextConfig: NextConfig = {
  basePath: "/creative",
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // sharp e în lista Next de pachete lăsate în afara bundle-ului; așa intră în bundle, deci se poate înlocui
  transpilePackages: ["sharp"],
  webpack(config, { webpack }) {
    // înlocuire înainte de „externals” (Next lasă sharp în afara bundle-ului; aici trebuie să intre modulul mic)
    const swap: [RegExp, string][] = [
      [/^sharp$/, "sharp.js"],
      [/^@vercel\/blob$/, "blob.js"],
      [/^workflow$/, "workflow.js"],
      [/^workflow\/api$/, "workflow-api.js"],
      [/^@\/workflows\/produce$/, "produce.js"],
    ];
    for (const [re, file] of swap) config.plugins.push(new webpack.NormalModuleReplacementPlugin(re, shim(file)));
    return config;
  },
};

export default nextConfig;
