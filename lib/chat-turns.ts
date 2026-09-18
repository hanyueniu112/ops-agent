type SessionTurn = {
  seq: number;
  abort: AbortController;
};

const turns = new Map<string, SessionTurn>();

export function beginSessionTurn(sessionId: string) {
  const previous = turns.get(sessionId);
  previous?.abort.abort();
  const seq = (previous?.seq || 0) + 1;
  const abort = new AbortController();
  turns.set(sessionId, { seq, abort });
  return { seq, signal: abort.signal };
}

export function isCurrentTurn(sessionId: string, seq: number) {
  return turns.get(sessionId)?.seq === seq;
}

export function abortSessionTurn(sessionId: string) {
  turns.get(sessionId)?.abort.abort();
}
