/**
 * 添付アプリアイコンから favicon / PWA 用 PNG・ICO を生成する（手動実行用）
 */
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import toIco from "to-ico";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const publicDir = join(root, "public");

const SOURCE = process.argv[2];
if (!SOURCE) {
  console.error("Usage: node scripts/generate-app-icons.mjs <source.png>");
  process.exit(1);
}

const outputs = [
  { file: "favicon-16x16.png", size: 16 },
  { file: "favicon-32x32.png", size: 32 },
  { file: "apple-touch-icon.png", size: 180 },
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
];

const source = readFileSync(SOURCE);

for (const { file, size } of outputs) {
  await sharp(source)
    .resize(size, size, { fit: "cover" })
    .png()
    .toFile(join(publicDir, file));
  console.log(`wrote ${file} (${size}x${size})`);
}

const ico16 = await sharp(source).resize(16, 16, { fit: "cover" }).png().toBuffer();
const ico32 = await sharp(source).resize(32, 32, { fit: "cover" }).png().toBuffer();
writeFileSync(join(publicDir, "favicon.ico"), await toIco([ico16, ico32]));
console.log("wrote favicon.ico");
