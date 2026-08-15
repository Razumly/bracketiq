import { act, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

import RegistrationHoldTimer from "../RegistrationHoldTimer";
import { renderWithMantine } from "../../../../test/utils/renderWithMantine";

describe("RegistrationHoldTimer", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("derives a replacement countdown immediately and expires only the active hold", () => {
    const now = new Date("2026-08-15T12:00:00.000Z");
    jest.useFakeTimers();
    jest.setSystemTime(now);
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

    rerender(
      <MantineProvider>
        <RegistrationHoldTimer
          expiresAt={replacementExpiration}
          onExpire={onExpire}
        />
      </MantineProvider>,
    );

    expect(
      screen.getByText("Your registration is held for 02:00"),
    ).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(120_000);
    });

    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText(/Your registration is held for/),
    ).not.toBeInTheDocument();
  });

  it("does not render or notify for missing and invalid expirations", () => {
    const onExpire = jest.fn();
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
    expect(onExpire).not.toHaveBeenCalled();
  });
});
