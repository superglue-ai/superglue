import { RequestOptions, SelfHealingMode } from "@superglue/client";
import { DataStore } from "../datastore/types.js";


export type Context = {
  datastore: DataStore;
  orgId: string;
};
export type Metadata = {
  runId?: string;
  orgId?: string;
};

export function isSelfHealingEnabled(options: RequestOptions): boolean {
    return options?.selfHealing ? options.selfHealing === SelfHealingMode.ENABLED || options.selfHealing === SelfHealingMode.REQUEST_ONLY : true;
}
  