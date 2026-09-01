export type BoundedByteStream = {
  getReader: () => BoundedByteStreamReader;
};

export type BoundedByteStreamReader = {
  read: () => Promise<ReadableStreamReadResult<Uint8Array>>;
  cancel: (reason?: unknown) => Promise<void>;
  releaseLock: () => void;
};

type AbortRead = Readonly<{
  promise: Promise<never> | null;
  cleanup: () => void;
}>;

const abortReadFor = (signal: AbortSignal | undefined): AbortRead => {
  if (!signal) return { promise: null, cleanup: () => undefined };
  let removeAbortListener: (() => void) | null = null;
  const promise = new Promise<never>((_, reject) => {
    const abort = (): void => reject(new Error('Response body read aborted.'));
    if (signal.aborted) abort();
    else {
      signal.addEventListener('abort', abort, { once: true });
      removeAbortListener = () => signal.removeEventListener('abort', abort);
    }
  });
  return {
    promise,
    cleanup: () => {
      if (removeAbortListener) removeAbortListener();
    },
  };
};

const readBoundedChunk = (
  reader: BoundedByteStreamReader,
  abortPromise: Promise<never> | null,
): Promise<ReadableStreamReadResult<Uint8Array>> => (
  abortPromise
    ? Promise.race([reader.read(), abortPromise])
    : reader.read()
);

const cancelBoundedReader = async (
  reader: BoundedByteStreamReader,
): Promise<void> => {
  await reader.cancel().catch(() => undefined);
};

export const readBoundedByteStream = async (
  stream: BoundedByteStream,
  maximumBytes: number,
  signal?: AbortSignal,
): Promise<Buffer> => {
  if (!Number.isInteger(maximumBytes) || maximumBytes < 0) {
    throw new Error('A non-negative integer byte limit is required.');
  }
  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  let byteSize = 0;
  let cancelled = false;
  const abortRead = abortReadFor(signal);
  try {
    while (true) {
      const result = await readBoundedChunk(reader, abortRead.promise);
      if (result.done) break;
      if (!result.value?.byteLength) continue;
      byteSize += result.value.byteLength;
      if (byteSize > maximumBytes) {
        cancelled = true;
        await cancelBoundedReader(reader);
        throw new Error(`Response body exceeds the ${maximumBytes} byte limit.`);
      }
      chunks.push(Buffer.from(result.value));
    }
  } catch (error) {
    if (!cancelled) {
      cancelled = true;
      await cancelBoundedReader(reader);
    }
    throw error;
  } finally {
    abortRead.cleanup();
    reader.releaseLock();
  }
  return Buffer.concat(chunks, byteSize);
};
