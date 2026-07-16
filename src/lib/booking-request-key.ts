export type RequestKeyFactory = () => string;

export function createBookingRequestKey(): string {
  return crypto.randomUUID();
}

export function isBookingRequestKeyMismatch(error: string | null | undefined): boolean {
  return Boolean(error?.includes("IDEMPOTENCY_KEY_REUSED"));
}

export class BookingRequestKeyLifecycle {
  private requestKey: string | null = null;

  constructor(private readonly createKey: RequestKeyFactory = createBookingRequestKey) {}

  current(): string {
    if (!this.requestKey) this.requestKey = this.createKey();
    return this.requestKey;
  }

  complete(): void {
    this.requestKey = null;
  }

  handleError(error: string | null | undefined): void {
    if (isBookingRequestKeyMismatch(error)) this.requestKey = null;
  }
}
