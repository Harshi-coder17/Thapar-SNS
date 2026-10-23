#!/usr/bin/env node
// Samples colours from the local design montage (project-docs/design-reference, not committed)
// so design tokens are measured, not guessed. Prints the dominant colour of small regions.
// Usage: node scripts/design/sample-colors.mjs [x,y,w,h ...]
import { existsSync } from "node:fs";

import sharp from "sharp";

const MONTAGE = "project-docs/design-reference/thapar-sns-master-visual-reference.png";

// Regions in montage pixel coordinates (1536 x 1024), chosen from panels 5, 6 and 8.
const DEFAULT_REGIONS = {
  "primary button (panel 5 Upload Material)": [418, 446, 70, 12],
  "primary button (panel 6 Create Request)": [826, 438, 64, 12],
  "active chip (panel 5 All)": [114, 472, 18, 9],
  "active nav background (panel 5)": [64, 504, 26, 9],
  "sidebar background (panel 5)": [30, 610, 40, 30],
  "card background (panel 5)": [250, 640, 40, 10],
  "page title text (panel 5)": [110, 412, 90, 14],
};

const toHex = ([r, g, b]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

async function dominant(image, [left, top, width, height]) {
  const { data, info } = await image.clone().extract({ left, top, width, height }).raw().toBuffer({ resolveWithObject: true });
  const counts = new Map();
  let darkest = [255, 255, 255];
  for (let i = 0; i < data.length; i += info.channels) {
    const rgb = [data[i], data[i + 1], data[i + 2]];
    const key = rgb.map((v) => v & 0xfc).join(",");
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (rgb[0] + rgb[1] + rgb[2] < darkest[0] + darkest[1] + darkest[2]) darkest = rgb;
  }
  const [top1] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return { dominant: toHex(top1[0].split(",").map(Number)), darkest: toHex(darkest) };
}

if (!existsSync(MONTAGE)) {
  console.error(`design:sample-colors: ${MONTAGE} not found (it is kept locally and not committed).`);
  process.exit(1);
}
const image = sharp(MONTAGE).removeAlpha();
const args = process.argv.slice(2);
const regions = args.length > 0 ? Object.fromEntries(args.map((a) => [a, a.split(",").map(Number)])) : DEFAULT_REGIONS;
for (const [label, region] of Object.entries(regions)) {
  const { dominant: hex, darkest } = await dominant(image, region);
  console.log(`${label.padEnd(44)} dominant ${hex}  darkest ${darkest}`);
}
