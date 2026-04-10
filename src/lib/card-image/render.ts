/**
 * Core Satori rendering engine.
 * Converts JSX templates to PNG images.
 */

import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { loadFonts } from "./fonts";
import { cardSizes } from "./tokens";
import type { CardSize } from "./types";
import type { ReactNode } from "react";

export interface RenderResult {
  png: Buffer;
  width: number;
  height: number;
}

/**
 * Render a JSX element to a PNG buffer.
 */
export async function renderToPng(
  element: ReactNode,
  size: CardSize
): Promise<RenderResult> {
  const fonts = await loadFonts();
  const { width, height } = cardSizes[size as keyof typeof cardSizes];

  const svg = await satori(element as React.ReactNode, {
    width,
    height,
    fonts: fonts.map((f) => ({
      name: f.name,
      data: f.data,
      weight: f.weight as 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900,
    })),
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
  });
  const pngData = resvg.render();
  const png = pngData.asPng();

  return { png: Buffer.from(png), width, height };
}
