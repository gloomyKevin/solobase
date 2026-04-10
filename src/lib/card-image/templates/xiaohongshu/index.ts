import { TemplateA } from "./TemplateA";
import { TemplateB } from "./TemplateB";
import { TemplateC } from "./TemplateC";
import type { CardData, TemplateVariant } from "../../types";
import type { ReactElement } from "react";

export const xiaohongshuTemplates: Record<
  TemplateVariant,
  (props: { data: CardData }) => ReactElement
> = {
  editorial: TemplateA,
  "data-grid": TemplateB,
  "hero-screenshot": TemplateC,
};

export { TemplateA, TemplateB, TemplateC };
