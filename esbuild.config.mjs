import { build, context } from "esbuild";
import { mkdirSync, copyFileSync, readdirSync } from "node:fs";

const watch = process.argv.includes("--watch");
const outdir = "dist";

const buildOptions = {
  entryPoints: {
    "background/index": "background/index.ts",
    "content/inject": "content/inject.ts",
    "content/popover-frame": "content/popover-frame.ts",
    "content/fallback-frame": "content/fallback-frame.ts",
  },
  bundle: true,
  platform: "browser",
  target: "chrome100",
  format: "iife",
  sourcemap: true,
  outdir,
  logLevel: "info",
};

function copyStaticFiles() {
  mkdirSync(outdir, { recursive: true });
  copyFileSync("manifest.json", `${outdir}/manifest.json`);
  mkdirSync(`${outdir}/options`, { recursive: true });
  copyFileSync("options/index.html", `${outdir}/options/index.html`);
  mkdirSync(`${outdir}/content`, { recursive: true });
  copyFileSync("content/popover-frame.html", `${outdir}/content/popover-frame.html`);
  copyFileSync("content/fallback-frame.html", `${outdir}/content/fallback-frame.html`);
  mkdirSync(`${outdir}/icons`, { recursive: true });
  for (const file of readdirSync("icons")) {
    copyFileSync(`icons/${file}`, `${outdir}/icons/${file}`);
  }
}

async function run() {
  copyStaticFiles();
  if (watch) {
    const ctx = await context(buildOptions);
    await ctx.watch();
    console.log("watching... (Ctrl+C to stop)");
  } else {
    await build(buildOptions);
    console.log(`build complete -> ${outdir}/`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
