import { DataStore } from "../datastore/types.js";

export type Context = {
  datastore: DataStore;
  orgId: string;
};
export type Metadata = {
  runId?: string;
  orgId?: string;
};
