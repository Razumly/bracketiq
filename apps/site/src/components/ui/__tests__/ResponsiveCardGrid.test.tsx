import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

import ResponsiveCardGrid from '../ResponsiveCardGrid';

class ResizeObserverMock {
  observe() {}

  disconnect() {}
}

describe('ResponsiveCardGrid', () => {
  const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 680,
    });
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: ResizeObserverMock,
    });
  });

  afterEach(() => {
    if (originalClientWidth) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
    }
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: originalResizeObserver,
    });
  });

  it('sets the measured column count before the first paint', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      flushSync(() => {
        root.render(
          <ResponsiveCardGrid>
            <article>Event</article>
          </ResponsiveCardGrid>,
        );
      });

      expect(container.firstElementChild).toHaveStyle('--responsive-card-columns: 2');
    } finally {
      root.unmount();
      container.remove();
    }
  });
});
