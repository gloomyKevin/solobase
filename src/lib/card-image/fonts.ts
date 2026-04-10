import { readFile } from "fs/promises";
import { join } from "path";

const FONTS_DIR = join(process.cwd(), "src/assets/fonts");

type FontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

export interface LoadedFont {
  name: string;
  data: ArrayBuffer;
  weight: FontWeight;
}

let cachedFonts: LoadedFont[] | null = null;

/**
 * Load font files for Satori rendering. Cached after first call.
 */
export async function loadFonts() {
  if (cachedFonts) return cachedFonts;

  const [notoSansSC, dmSans] = await Promise.all([
    readFile(join(FONTS_DIR, "NotoSansSC-Regular.ttf")),
    readFile(join(FONTS_DIR, "DMSans-Regular.ttf")),
  ]);

  cachedFonts = [
    {
      name: "Noto Sans SC",
      data: notoSansSC.buffer as ArrayBuffer,
      weight: 400,
    },
    {
      name: "DM Sans",
      data: dmSans.buffer as ArrayBuffer,
      weight: 400,
    },
  ];

  return cachedFonts;
}
