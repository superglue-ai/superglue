
export interface WorkerTask<Payload, Result> {
    run(payload: Payload): Promise<Result>;
}
  