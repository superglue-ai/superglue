
import { Request } from "express";
import { Datastore } from "../your/datastore/path";

declare module "express-serve-static-core" {
  interface Request {
    orgId?: string;
    context?: {
      datastore: Datastore;
    };
  }
}
