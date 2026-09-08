import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImageUploader } from "../ImageUploader";
import { buildUser } from "../../../../test/factories";

jest.mock("@/app/providers", () => ({ useApp: jest.fn() }));
jest.mock("@/lib/userService", () => ({
  userService: { updateUser: jest.fn() },
}));

const app = jest.requireMock("@/app/providers");
const userService = jest.requireMock("@/lib/userService").userService;

describe("ImageUploader", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    app.useApp.mockReturnValue({
      user: buildUser({ uploadedImages: ["image-1"] }),
      refreshUser: jest.fn(),
    });
  });

  it("selects a saved image with the keyboard and can remove it", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<ImageUploader onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Select image" }));
    const image = screen.getByRole("button", {
      name: "Select uploaded image 1",
    });
    image.focus();
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith(
      "image-1",
      "/api/files/image-1/preview?w=240&h=240&fit=cover",
    );
    expect(screen.getByAltText("Selected image")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove image" }));
    expect(onChange).toHaveBeenLastCalledWith("", "");
    expect(screen.queryByAltText("Selected image")).not.toBeInTheDocument();
  });

  it("prevents selection while read-only, then permits it when unlocked", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const { rerender } = render(<ImageUploader onChange={onChange} readOnly />);
    await user.click(screen.getByRole("button", { name: "Select image" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    rerender(<ImageUploader onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Select image" }));
    await user.click(
      screen.getByRole("button", { name: "Select uploaded image 1" }),
    );
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("reports an unsupported file without updating the user or selecting it", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<ImageUploader onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Select image" }));
    fireEvent.change(screen.getByLabelText("Upload new image"), {
      target: {
        files: [new File(["text"], "notes.txt", { type: "text/plain" })],
      },
    });
    expect(
      await screen.findByText(
        "Please select a PNG, JPEG, WebP, AVIF, or SVG image",
      ),
    ).toBeInTheDocument();
    expect(userService.updateUser).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("blocks dismissal and image selection during upload and permits retry after failure", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    let failUpload!: (error: Error) => void;
    const originalFetch = Object.getOwnPropertyDescriptor(global, "fetch");
    const request = jest.fn(
      () =>
        new Promise((_resolve, reject) => {
          failUpload = reject;
        }),
    );
    Object.defineProperty(global, "fetch", { configurable: true, writable: true, value: request });
    try {
      render(<ImageUploader onChange={onChange} />);
      await user.click(screen.getByRole("button", { name: "Select image" }));
      await user.upload(
        screen.getByLabelText("Upload new image"),
        new File(["image"], "logo.png", { type: "image/png" }),
      );
      expect(
        screen.getByRole("button", { name: "Select uploaded image 1" }),
      ).toBeDisabled();
      await user.keyboard("{Escape}");
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();
      await act(async () => {
        failUpload(new Error("Unavailable"));
      });
      expect(
        await screen.findByText("Failed to upload image. Please try again."),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("Upload new image")).toBeEnabled();
      await user.click(
        screen.getByRole("button", { name: "Select uploaded image 1" }),
      );
      expect(onChange).toHaveBeenCalledTimes(1);
    } finally {
      if (originalFetch) Object.defineProperty(global, "fetch", originalFetch);
      else Reflect.deleteProperty(global, "fetch");
    }
  });
});
