import { build } from "esbuild";

await build({
  entryPoints: ["src/background.ts"],
  outfile: "dist/background.js",
  bundle: true,
  format: "esm",
  target: "chrome120",
  platform: "browser",
  sourcemap: false,
  logLevel: "info"
});
