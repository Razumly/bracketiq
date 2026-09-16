import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CreateTeamModal from "../CreateTeamModal";
import { buildTeam, buildUser } from "../../../../test/factories";
import { renderWithMantine } from "../../../../test/utils/renderWithMantine";
import { apiRequest } from "@/lib/apiClient";

jest.mock("@/lib/apiClient", () => ({ apiRequest: jest.fn() }));

jest.mock("@/lib/teamService", () => ({
  teamService: {
    createTeam: jest.fn(),
  },
}));

jest.mock("../ImageUploader", () => ({
  ImageUploader: () => <div data-testid="image-uploader" />,
}));

const teamServiceMock = jest.requireMock("@/lib/teamService").teamService as {
  createTeam: jest.Mock;
};

const selectSport = async (
  user: ReturnType<typeof userEvent.setup>,
  sport = "Indoor Volleyball",
) => {
  await user.click(screen.getByRole("combobox", { name: "Sport" }));
  await user.click(await screen.findByRole("option", { name: sport }));
};

describe("CreateTeamModal", () => {
  beforeEach(() => {
    jest.mocked(apiRequest).mockReset();
    jest.mocked(apiRequest).mockResolvedValue({ templates: [] });
    teamServiceMock.createTeam.mockReset();
    teamServiceMock.createTeam.mockResolvedValue(buildTeam());
  });

  it("keeps the draft and blocks duplicate submissions and dismissal during creation", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    let rejectCreate!: (error: Error) => void;
    teamServiceMock.createTeam.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectCreate = reject;
      }),
    );
    renderWithMantine(
      <CreateTeamModal isOpen currentUser={buildUser()} onClose={onClose} />,
    );
    await user.type(
      screen.getByLabelText("Team Name", { exact: false }),
      "Summit United",
    );
    await selectSport(user);
    const submit = screen.getByRole("button", { name: "Create Team" });
    await user.click(submit);
    expect(screen.getByLabelText("Team Name", { exact: false })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.submit(submit.closest("form")!);
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(teamServiceMock.createTeam).toHaveBeenCalledTimes(1);
    await act(async () => {
      rejectCreate(new Error("Team could not be saved."));
    });
    expect(
      await screen.findByText("Team could not be saved."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Team Name", { exact: false })).toHaveValue(
      "Summit United",
    );
    expect(screen.getByLabelText("Team Name", { exact: false })).toBeEnabled();
  });

  it("keeps editable fields during template loading and retains the draft through retry", async () => {
    const user = userEvent.setup();
    let rejectLoad!: (error: Error) => void;
    jest.mocked(apiRequest).mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectLoad = reject;
      }),
    );
    renderWithMantine(
      <CreateTeamModal
        isOpen
        currentUser={buildUser()}
        onClose={jest.fn()}
        organizationId="org_1"
      />,
    );
    await user.type(
      screen.getByLabelText("Team Name", { exact: false }),
      "Summit United",
    );
    await selectSport(user);
    expect(
      screen.getByRole("combobox", { name: "Required Documents" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create Team" })).toBeDisabled();
    await act(async () => {
      rejectLoad(new Error("Unavailable"));
    });
    expect(screen.getByRole("button", { name: "Create Team" })).toBeDisabled();
    jest.mocked(apiRequest).mockResolvedValueOnce({
      templates: [
        { id: "waiver", title: "Player waiver", status: "ACTIVE" },
        { id: "old", title: "Old waiver", status: "ARCHIVED" },
      ],
    });
    await user.click(
      await screen.findByRole("button", { name: "Retry templates" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Required Documents" }),
      ).toBeEnabled(),
    );
    expect(screen.getByLabelText("Team Name", { exact: false })).toHaveValue(
      "Summit United",
    );
    await user.click(
      screen.getByRole("combobox", { name: "Required Documents" }),
    );
    expect(
      screen.queryByRole("option", { name: "Old waiver" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Player waiver" }));
    await user.click(screen.getByRole("button", { name: "Create Team" }));
    expect(teamServiceMock.createTeam).toHaveBeenCalledWith(
      "Summit United",
      expect.any(String),
      "",
      "Indoor Volleyball",
      6,
      undefined,
      expect.objectContaining({
        organizationId: "org_1",
        requiredTemplateIds: ["waiver"],
      }),
    );
  });

  it("ignores template responses from the previous organization", async () => {
    let finishOldLoad!: (value: {
      templates: { id: string; title: string }[];
    }) => void;
    jest.mocked(apiRequest).mockReturnValueOnce(
      new Promise((resolve) => {
        finishOldLoad = resolve;
      }),
    );
    const currentUser = buildUser();
    const onClose = jest.fn();
    const { rerender } = renderWithMantine(
      <CreateTeamModal
        isOpen
        currentUser={currentUser}
        onClose={onClose}
        organizationId="old"
      />,
    );
    jest
      .mocked(apiRequest)
      .mockResolvedValueOnce({
        templates: [{ id: "new-waiver", title: "New waiver" }],
      });
    rerender(
      <CreateTeamModal
        isOpen
        currentUser={currentUser}
        onClose={onClose}
        organizationId="new"
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Required Documents" }),
      ).toBeEnabled(),
    );
    await act(async () => {
      finishOldLoad({ templates: [{ id: "old-waiver", title: "Old waiver" }] });
    });
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("combobox", { name: "Required Documents" }),
    );
    expect(
      screen.getByRole("option", { name: "New waiver" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Old waiver" }),
    ).not.toBeInTheDocument();
  });

  it("allows team size to be cleared and set to 0 while showing the size warning", async () => {
    const user = userEvent.setup();

    renderWithMantine(
      <CreateTeamModal
        isOpen
        onClose={jest.fn()}
        currentUser={buildUser({ $id: "user_1" })}
      />,
    );

    const teamSizeInput = screen.getByLabelText(/Team Size/i);

    await user.clear(teamSizeInput);
    expect((teamSizeInput as HTMLInputElement).value).toBe("");
    expect(
      screen.getByText("Team size must be 2 or above."),
    ).toBeInTheDocument();

    await user.type(teamSizeInput, "0");
    expect((teamSizeInput as HTMLInputElement).value).toBe("0");
    expect(
      screen.getByText("Team size must be 2 or above."),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Team Name/i), "Test team");
    await selectSport(user);
    await user.click(screen.getByRole("button", { name: /Create Team/i }));

    expect(teamServiceMock.createTeam).not.toHaveBeenCalled();
    expect(screen.getAllByText("Team size must be 2 or above.")).toHaveLength(
      2,
    );
  });

  it("submits a team size of 2", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    const onTeamCreated = jest.fn();
    const currentUser = {
      ...buildUser({ $id: "" }),
      id: "user_legacy",
    } as any;

    renderWithMantine(
      <CreateTeamModal
        isOpen
        onClose={onClose}
        currentUser={currentUser}
        onTeamCreated={onTeamCreated}
      />,
    );

    await user.type(screen.getByLabelText(/Team Name/i), "Test team");
    await selectSport(user);
    const teamSizeInput = screen.getByLabelText(/Team Size/i);
    await user.clear(teamSizeInput);
    await user.type(teamSizeInput, "2");
    await user.click(screen.getByRole("button", { name: /Create Team/i }));

    await waitFor(() => {
      expect(teamServiceMock.createTeam).toHaveBeenCalledWith(
        "Test team",
        "user_legacy",
        expect.any(String),
        expect.any(String),
        2,
        undefined,
        expect.objectContaining({
          addSelfAsPlayer: true,
        }),
      );
    });
    expect(onTeamCreated).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("submits affiliate team registration settings", async () => {
    const user = userEvent.setup();

    renderWithMantine(
      <CreateTeamModal
        isOpen
        onClose={jest.fn()}
        currentUser={buildUser({ $id: "user_1" })}
      />,
    );

    await user.type(screen.getByLabelText(/Team Name/i), "Partner team");
    await selectSport(user);
    await user.click(screen.getByLabelText(/External team registration/i));
    await user.type(
      screen.getByLabelText(/Affiliate registration link/i),
      "https://partner.example.com/signup",
    );
    await user.click(screen.getByRole("button", { name: /Create Team/i }));

    await waitFor(() => {
      expect(teamServiceMock.createTeam).toHaveBeenCalledWith(
        "Partner team",
        "user_1",
        expect.any(String),
        expect.any(String),
        6,
        undefined,
        expect.objectContaining({
          affiliateUrl: "https://partner.example.com/signup",
          joinPolicy: "OPEN_REGISTRATION",
          openRegistration: true,
        }),
      );
    });
  });

  it("shows a sign-in warning instead of submitting without a current user id", async () => {
    const user = userEvent.setup();

    renderWithMantine(
      <CreateTeamModal isOpen onClose={jest.fn()} currentUser={null} />,
    );

    await user.type(screen.getByLabelText(/Team Name/i), "Test team");
    await selectSport(user);
    const teamSizeInput = screen.getByLabelText(/Team Size/i);
    await user.clear(teamSizeInput);
    await user.type(teamSizeInput, "3");
    await user.click(screen.getByRole("button", { name: /Create Team/i }));

    expect(teamServiceMock.createTeam).not.toHaveBeenCalled();
    expect(
      screen.getByText("Sign in again before creating a team."),
    ).toBeInTheDocument();
  });
});
