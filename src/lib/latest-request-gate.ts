export function createLatestRequestGate() {
  let sequence = 0;

  return {
    issue() {
      sequence += 1;
      return sequence;
    },
    invalidate() {
      sequence += 1;
    },
    isCurrent(requestId: number) {
      return requestId === sequence;
    },
  };
}
