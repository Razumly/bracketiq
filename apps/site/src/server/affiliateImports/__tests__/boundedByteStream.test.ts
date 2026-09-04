/** @jest-environment node */

import { readBoundedByteStream } from '../boundedByteStream';

describe('bounded byte stream', () => {
  it('returns bytes within the limit', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('bounded content'));
        controller.close();
      },
    });

    await expect(readBoundedByteStream(stream, 64)).resolves.toEqual(
      Buffer.from('bounded content'),
    );
  });

  it('cancels and rejects when a chunk exceeds the limit', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(65));
      },
      cancel() {
        cancelled = true;
      },
    });

    await expect(readBoundedByteStream(stream, 64)).rejects.toThrow(
      'Response body exceeds the 64 byte limit.',
    );
    expect(cancelled).toBe(true);
  });

  it('cancels a pending stream when its signal aborts', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const controller = new AbortController();
    const reading = readBoundedByteStream(stream, 64, controller.signal);
    controller.abort();

    await expect(reading).rejects.toThrow('Response body read aborted.');
    expect(cancelled).toBe(true);
  });
});
