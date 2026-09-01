import { TextDecoder, TextEncoder } from 'node:util';

Object.assign(globalThis, { TextDecoder, TextEncoder });

import '@testing-library/jest-dom';

afterEach(() => {
  jest.clearAllMocks();
});

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function pointerEventValue<T>(value: T | null | undefined, fallback: T): T {
  return value ?? fallback;
}

class PointerEventMock extends MouseEvent {
  readonly pointerId: number;
  readonly width: number;
  readonly height: number;
  readonly pressure: number;
  readonly tangentialPressure: number;
  readonly tiltX: number;
  readonly tiltY: number;
  readonly twist: number;
  readonly pointerType: string;
  readonly isPrimary: boolean;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = pointerEventValue(init.pointerId, 0);
    this.width = pointerEventValue(init.width, 1);
    this.height = pointerEventValue(init.height, 1);
    this.pressure = pointerEventValue(init.pressure, 0);
    this.tangentialPressure = pointerEventValue(init.tangentialPressure, 0);
    this.tiltX = pointerEventValue(init.tiltX, 0);
    this.tiltY = pointerEventValue(init.tiltY, 0);
    this.twist = pointerEventValue(init.twist, 0);
    this.pointerType = pointerEventValue(init.pointerType, "");
    this.isPrimary = pointerEventValue(init.isPrimary, false);
  }
}

if (typeof window !== 'undefined') {
  (window as any).ResizeObserver = ResizeObserverMock;
  if (!window.HTMLElement.prototype.scrollIntoView) {
    window.HTMLElement.prototype.scrollIntoView = () => {};
  }
  if (typeof window.PointerEvent !== "function") {
    window.PointerEvent = PointerEventMock as typeof PointerEvent;
  }
}

(globalThis as any).ResizeObserver = ResizeObserverMock;

if (typeof globalThis.PointerEvent !== "function") {
  globalThis.PointerEvent = PointerEventMock as typeof PointerEvent;
}
