import { act, renderHook } from '@testing-library/react';

import { apiRequest } from '@/lib/apiClient';
import { connectEventMatchSocket } from '@/lib/matchRealtimeClient';
import type { Match } from '@/types';
import useEventMatchRealtime from '../useEventMatchRealtime';

jest.mock('@/lib/apiClient', () => ({
  ...jest.requireActual('@/lib/apiClient'),
  apiRequest: jest.fn(),
}));
jest.mock('@/lib/matchRealtimeClient', () => ({
  connectEventMatchSocket: jest.fn(),
}));

const connectSocketMock = jest.mocked(connectEventMatchSocket);
const apiRequestMock = jest.mocked(apiRequest);

const buildParams = (): Parameters<typeof useEventMatchRealtime>[0] => ({
  hasUnsavedChangesRef: { current: false },
  isBlockedForLocalEdits: false,
  isCreateMode: false,
  targetEventId: 'event_1',
  setChangesEvent: jest.fn(),
  setChangesMatches: jest.fn(),
  setEvent: jest.fn(),
  setMatchBeingEdited: jest.fn(),
  setMatches: jest.fn(),
  setScoreUpdateMatch: jest.fn(),
});

const deferRefresh = () => {
  let resolve!: (value: { matches: Match[] }) => void;
  const promise = new Promise<{ matches: Match[] }>((resolvePromise) => {
    resolve = resolvePromise;
  });
  apiRequestMock.mockReturnValue(promise);
  return { resolve, promise };
};

describe('useEventMatchRealtime cleanup', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    connectSocketMock.mockReset();
    apiRequestMock.mockReset();
    connectSocketMock.mockResolvedValue({ close: jest.fn() } as unknown as WebSocket);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('leaves no reconnect timer when a disconnect refresh finishes after unmount', async () => {
    const refresh = deferRefresh();
    const params = buildParams();
    const hook = renderHook(() => useEventMatchRealtime(params));
    await act(async () => {});

    act(() => {
      connectSocketMock.mock.calls[0][0].onClose?.(new CloseEvent('close'));
    });
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    hook.unmount();

    await act(async () => {
      refresh.resolve({ matches: [] });
      await refresh.promise;
    });

    expect(jest.getTimerCount()).toBe(0);
    expect(apiRequestMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(params.setMatches).not.toHaveBeenCalled();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2500);
    });
    expect(connectSocketMock).toHaveBeenCalledTimes(1);
  });

  it('does not attempt a connection after an unblock refresh finishes after unmount', async () => {
    const refresh = deferRefresh();
    const params = buildParams();
    const hook = renderHook(
      ({ blocked }) => useEventMatchRealtime({ ...params, isBlockedForLocalEdits: blocked }),
      { initialProps: { blocked: true } },
    );
    hook.rerender({ blocked: false });
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    hook.unmount();

    await act(async () => {
      refresh.resolve({ matches: [] });
      await refresh.promise;
    });

    expect(connectSocketMock).not.toHaveBeenCalled();
    expect(params.setMatches).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('refreshes and reconnects after a disconnect while still mounted', async () => {
    const refresh = deferRefresh();
    const params = buildParams();
    const hook = renderHook(() => useEventMatchRealtime(params));
    await act(async () => {});

    act(() => {
      connectSocketMock.mock.calls[0][0].onClose?.(new CloseEvent('close'));
    });
    await act(async () => {
      refresh.resolve({ matches: [] });
      await refresh.promise;
    });

    expect(params.setMatches).toHaveBeenCalledWith([]);
    expect(apiRequestMock.mock.calls[0][1]?.signal?.aborted).toBe(false);
    expect(connectSocketMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2500);
    });
    expect(connectSocketMock).toHaveBeenCalledTimes(2);
    hook.unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});
