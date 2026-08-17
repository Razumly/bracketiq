import { act, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

import RegistrationHoldTimer from "../RegistrationHoldTimer";
import { renderWithMantine } from "../../../../test/utils/renderWithMantine";

describe("RegistrationHoldTimer", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("derives a replacement countdown immediately and cleans up the prior interval", () => {
    const now = new Date("2026-08-15T12:00:00.000Z");
    jest.useFakeTimers();
    jest.setSystemTime(now);
    const setIntervalSpy = jest.spyOn(window, "setInterval");
    const clearIntervalSpy = jest.spyOn(window, "clearInterval");
    const onExpire = jest.fn();
    const firstExpiration = new Date(now.getTime() + 60_000).toISOString();
    const replacementExpiration = new Date(
      now.getTime() + 120_000,
    ).toISOString();

    const { rerender } = renderWithMantine(
      <MantineProvider>
        <RegistrationHoldTimer
          expiresAt={firstExpiration}
          onExpire={onExpire}
        />
      </MantineProvider>,
    );

    expect(
      screen.getByText("Your registration is held for 01:00"),
    ).toBeInTheDocument();
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    const firstInterval = setIntervalSpy.mock.results[0]?.value;

    jest.setSystemTime(now.getTime() + 30_000);
    rerender(
      <MantineProvider>
        <RegistrationHoldTimer
          expiresAt={replacementExpiration}
          onExpire={onExpire}
        />
      </MantineProvider>,
    );

    expect(
      screen.getByText("Your registration is held for 01:30"),
    ).toBeInTheDocument();
    expect(setIntervalSpy).toHaveBeenCalledTimes(2);
    expect(clearIntervalSpy).toHaveBeenCalledWith(firstInterval);
    const replacementInterval = setIntervalSpy.mock.results[1]?.value;

    rerender(
      <MantineProvider>
        <RegistrationHoldTimer expiresAt={null} onExpire={onExpire} />
      </MantineProvider>,
    );

    expect(clearIntervalSpy).toHaveBeenCalledWith(replacementInterval);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("notifies once for the active hold and stops its interval at expiration", () => {
    const now = new Date("2026-08-15T12:00:00.000Z");
    jest.useFakeTimers();
    jest.setSystemTime(now);
    const onExpire = jest.fn();
    const expiration = new Date(now.getTime() + 2_000).toISOString();

    const { rerender } = renderWithMantine(
      <MantineProvider>
        <RegistrationHoldTimer expiresAt={expiration} onExpire={onExpire} />
      </MantineProvider>,
    );

    act(() => {
      jest.advanceTimersByTime(2_000);
    });

    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText(/Your registration is held for/),
    ).not.toBeInTheDocument();
    expect(jest.getTimerCount()).toBe(0);

    rerender(
      <MantineProvider>
        <RegistrationHoldTimer
          expiresAt={expiration}
          onExpire={() => onExpire()}
        />
      </MantineProvider>,
    );

    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("does not render, schedule, or notify for inactive expirations", () => {
    const now = new Date("2026-08-15T12:00:00.000Z");
    jest.useFakeTimers();
    jest.setSystemTime(now);
    const onExpire = jest.fn();
    const expired = new Date(now.getTime() - 1).toISOString();
    const { rerender } = renderWithMantine(
      <MantineProvider>
        <RegistrationHoldTimer expiresAt={null} onExpire={onExpire} />
      </MantineProvider>,
    );

    expect(
      screen.queryByText(/Your registration is held for/),
    ).not.toBeInTheDocument();

    rerender(
      <MantineProvider>
        <RegistrationHoldTimer expiresAt="not-a-date" onExpire={onExpire} />
      </MantineProvider>,
    );

    expect(
      screen.queryByText(/Your registration is held for/),
    ).not.toBeInTheDocument();

    rerender(
      <MantineProvider>
        <RegistrationHoldTimer expiresAt={expired} onExpire={onExpire} />
      </MantineProvider>,
    );

    expect(
      screen.queryByText(/Your registration is held for/),
    ).not.toBeInTheDocument();
    expect(onExpire).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
});
