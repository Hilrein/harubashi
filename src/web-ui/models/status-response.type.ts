/** Response shape for the GET /api/status endpoint. */
export interface StatusResponse {
  /** Health check indicator. */
  readonly status: 'ok';
  /** Current harubashi version. */
  readonly version: string;
  /** Name of the active configuration profile. */
  readonly activeProfile: string;
}
