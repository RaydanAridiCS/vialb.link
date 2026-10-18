export interface IHealthRepository {
  /** Resolves when the database answers a trivial query. */
  ping(): Promise<void>;
}
