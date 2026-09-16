/** Expected identity problems are not retryable infrastructure failures. */
export class LineIdentityReviewError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "LineIdentityReviewError";
  }
}
