import { build, context } from "esbuild";
import { mkdirSync, copyFileSync } from "node:fs";

const watch = process.argv.includes("--watch");
const outdir = "dist";

const buildOptions = {
  entryPoints: {
    "background/engine": "background/engine.ts",
    // Phase 1+: "content/inject": "content/inject.ts", "content/popover": "content/popover.ts", "options/index": "options/index.ts"
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
  // Phase 1+: also copy options/index.html, icons/
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
