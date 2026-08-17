import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { DEFAULT_BROADCAST_OVERLAY_CONFIG } from '@/server/broadcast/schemas';

jest.mock('@/components/broadcast/BroadcastControlRoom', () => ({
  __esModule: true,
  default: ({ state }: { state: { revision: number } }) => (
    <div data-testid="broadcast-control-revision">{state.revision}</div>
  ),
}));

import AdminBroadcastOverlaysPanel from '../AdminBroadcastOverlaysPanel';

const jsonResponse = (payload: unknown, ok = true): Response => ({
  ok,
  json: async () => payload,
} as Response);

const renderPanel = () => render(
  <MantineProvider>
    <AdminBroadcastOverlaysPanel active refreshKey={0} />
  </MantineProvider>,
);

describe('AdminBroadcastOverlaysPanel event picker', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      Reflect.deleteProperty(globalThis, 'fetch');
    }
    jest.restoreAllMocks();
  });

  it('loads every admin event page so older events are included in the picker data', async () => {
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/admin/events?limit=50&offset=0') {
        return Promise.resolve(jsonResponse({
          total: 4,
          events: [
            { $id: 'event_1', name: 'Newest Event' },
            { $id: 'event_2', name: 'Recent Event' },
          ],
        }));
      }
      if (url === '/api/admin/events?limit=50&offset=2') {
        return Promise.resolve(jsonResponse({
          total: 4,
          events: [
            { $id: 'event_2', name: 'Recent Event' },
            { $id: 'event_tournament', name: 'BracketIQ Leeroy Grass Tournament' },
          ],
        }));
      }
      if (url === '/api/events/event_1/broadcast-overlays') {
        return Promise.resolve(jsonResponse({ overlays: [] }));
      }
      if (url === '/api/events/event_1/matches') {
        return Promise.resolve(jsonResponse({ matches: [] }));
      }
      return Promise.resolve(jsonResponse({ error: `Unexpected fetch ${url}` }, false));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderPanel();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/events?limit=50&offset=2', { credentials: 'include' });
    });

    expect(screen.getByRole('textbox', { name: 'Event' })).toHaveValue('Newest Event');
  });

  it('keeps unsaved styling while a live refresh advances the control revision', async () => {
    let liveRevision = 1;
    let refreshOverlayState: (() => void) | null = null;
    jest.spyOn(window, 'setInterval').mockImplementation((handler, timeout) => {
      if (timeout === 1_500 && typeof handler === 'function') {
        refreshOverlayState = handler as () => void;
      }
      return 1;
    });
    const buildOverlay = () => ({
      id: 'overlay_1',
      name: 'Court One',
      status: 'DRAFT',
      eventId: 'event_1',
      draftConfig: DEFAULT_BROADCAST_OVERLAY_CONFIG,
      publishedConfig: null,
      publishedConfigRevision: 0,
      state: {
        id: 'state_1',
        revision: liveRevision,
        activeMatchId: null,
        scoringMode: 'AUTOMATIC',
        presentationState: {
          version: 1,
          teams: [],
          score: {
            currentSet: 1,
            points: [0, 0],
            sets: [],
            servingTeamId: null,
          },
        },
      },
    });
    const fetchMock = jest.fn(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === '/api/admin/events?limit=50&offset=0') {
          return Promise.resolve(jsonResponse({
            total: 1,
            events: [{ id: 'event_1', name: 'Current Event' }],
          }));
        }
        if (
          url === '/api/events/event_1/broadcast-overlays/overlay_1'
          && init?.method === 'PATCH'
        ) {
          return Promise.resolve(jsonResponse({ overlay: buildOverlay() }));
        }
        if (url === '/api/events/event_1/broadcast-overlays') {
          return Promise.resolve(jsonResponse({ overlays: [buildOverlay()] }));
        }
        if (url === '/api/events/event_1/matches') {
          return Promise.resolve(jsonResponse({ matches: [] }));
        }
        return Promise.resolve(
          jsonResponse({ error: `Unexpected fetch ${url}` }, false),
        );
      },
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderPanel();

    const maximumWidthInput = await screen.findByLabelText('Maximum width');
    await waitFor(() => {
      expect(screen.getByTestId('broadcast-control-revision')).toHaveTextContent(
        '1',
      );
    });
    fireEvent.change(maximumWidthInput, { target: { value: '1440' } });
    expect(maximumWidthInput).toHaveValue('1440 px');

    liveRevision = 2;
    const refresh = refreshOverlayState;
    if (!refresh) {
      throw new Error('Broadcast refresh interval was not registered');
    }
    await act(async () => {
      refresh();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId('broadcast-control-revision')).toHaveTextContent(
        '2',
      );
    });
    expect(maximumWidthInput).toHaveValue('1440 px');

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH'),
      ).toBe(true);
    });
    const patchCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === 'PATCH',
    );
    const patchBody = JSON.parse(String(patchCall?.[1]?.body));
    expect(patchBody.draftConfig.transform.maxWidth).toBe(1440);
  });
});
