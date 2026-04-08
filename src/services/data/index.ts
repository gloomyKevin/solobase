import type { DataService } from "./types";
import { createLocalJsonDataService } from "./local-json";

let instance: DataService | null = null;

export function getDataService(): DataService {
  if (!instance) {
    // MVP: always use local JSON. Future: switch on DATA_PROVIDER env var
    instance = createLocalJsonDataService();
  }
  return instance;
}

export type { DataService } from "./types";
