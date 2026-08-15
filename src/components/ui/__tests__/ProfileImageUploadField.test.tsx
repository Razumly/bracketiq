import { render, screen, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileImageUploadField } from '../ProfileImageUploadField';

describe('ProfileImageUploadField', () => {
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  const createObjectUrl = jest.fn((blob: Blob) =>
    blob instanceof File ? `blob:${blob.name}` : 'blob:profile-preview',
  );
  const revokeObjectUrl = jest.fn();

  beforeAll(() => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectUrl,
    });
  });

  beforeEach(() => {
    createObjectUrl.mockClear();
    revokeObjectUrl.mockClear();
  });

  afterAll(() => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: originalCreateObjectUrl,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: originalRevokeObjectUrl,
    });
  });

  it('displays the preview for a supported selected image', async () => {
    const user = userEvent.setup();
    const file = new File(['profile'], 'profile.png', { type: 'image/png' });
    let rerender: RenderResult['rerender'];
    const onFileChange = jest.fn((nextFile: File | null) => {
      rerender(
        <ProfileImageUploadField
          file={nextFile}
          onFileChange={onFileChange}
        />,
      );
    });

    ({ rerender } = render(
      <ProfileImageUploadField
        file={null}
        onFileChange={onFileChange}
      />,
    ));

    await user.upload(screen.getByLabelText(/profile photo/i), file);

    expect(onFileChange).toHaveBeenCalledWith(file);
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(createObjectUrl).toHaveBeenCalledWith(file);
    expect(screen.getByAltText('Profile preview')).toHaveAttribute('src', 'blob:profile.png');
  });

  it('switches directly between externally controlled file previews', () => {
    const firstFile = new File(['first'], 'first.png', { type: 'image/png' });
    const secondFile = new File(['second'], 'second.png', { type: 'image/png' });
    const onFileChange = jest.fn();
    const { rerender } = render(
      <ProfileImageUploadField
        file={firstFile}
        currentImageUrl="/persisted-profile.png"
        onFileChange={onFileChange}
      />,
    );
    const preview = screen.getByAltText('Profile preview');
    const revocations: Array<{ objectUrl: string; currentSrc: string | null }> = [];
    revokeObjectUrl.mockImplementationOnce((objectUrl: string) => {
      revocations.push({
        objectUrl,
        currentSrc: preview.getAttribute('src'),
      });
    });
    const observer = new MutationObserver(() => undefined);
    observer.observe(preview, {
      attributes: true,
      attributeFilter: ['src'],
      attributeOldValue: true,
    });

    rerender(
      <ProfileImageUploadField
        file={secondFile}
        currentImageUrl="/persisted-profile.png"
        onFileChange={onFileChange}
      />,
    );

    const previewChanges = observer.takeRecords();
    observer.disconnect();
    expect(preview).toHaveAttribute('src', 'blob:second.png');
    expect(previewChanges.map((change) => change.oldValue)).toEqual(['blob:first.png']);
    expect(createObjectUrl).toHaveBeenCalledTimes(2);
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:first.png');
    expect(revocations).toEqual([
      {
        objectUrl: 'blob:first.png',
        currentSrc: 'blob:second.png',
      },
    ]);
  });

  it('revokes a removed file preview once and falls back to the persisted image', async () => {
    const user = userEvent.setup();
    const file = new File(['profile'], 'profile.png', { type: 'image/png' });
    let rerender: RenderResult['rerender'];
    const onFileChange = jest.fn((nextFile: File | null) => {
      rerender(
        <ProfileImageUploadField
          file={nextFile}
          currentImageUrl="/persisted-profile.png"
          onFileChange={onFileChange}
        />,
      );
    });

    ({ rerender } = render(
      <ProfileImageUploadField
        file={file}
        currentImageUrl="/persisted-profile.png"
        onFileChange={onFileChange}
      />,
    ));

    await user.click(screen.getByRole('button', { name: /remove/i }));

    expect(onFileChange).toHaveBeenCalledWith(null);
    expect(screen.getByAltText('Profile preview')).toHaveAttribute('src', '/persisted-profile.png');
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:profile.png');
  });

  it('revokes the owned file preview once on unmount', () => {
    const file = new File(['profile'], 'profile.png', { type: 'image/png' });
    const { unmount } = render(
      <ProfileImageUploadField
        file={file}
        onFileChange={jest.fn()}
      />,
    );

    unmount();

    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:profile.png');
  });

  it('rejects unsupported image files without creating a preview URL', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const onError = jest.fn();
    const onFileChange = jest.fn();
    const file = new File(['not image'], 'profile.txt', { type: 'text/plain' });

    render(
      <ProfileImageUploadField
        file={null}
        onFileChange={onFileChange}
        onError={onError}
      />,
    );

    await user.upload(screen.getByLabelText(/profile photo/i), file);

    expect(onFileChange).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('Please select a PNG, JPEG, WebP, AVIF, or SVG image.');
    expect(createObjectUrl).not.toHaveBeenCalled();
  });

  it('rejects profile images larger than 10MB without creating a preview URL', async () => {
    const user = userEvent.setup();
    const onError = jest.fn();
    const onFileChange = jest.fn();
    const file = new File(['oversize'], 'profile.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', { value: 10 * 1024 * 1024 + 1 });

    render(
      <ProfileImageUploadField
        file={null}
        onFileChange={onFileChange}
        onError={onError}
      />,
    );

    await user.upload(screen.getByLabelText(/profile photo/i), file);

    expect(onFileChange).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('Profile photo must be 10MB or less.');
    expect(createObjectUrl).not.toHaveBeenCalled();
  });
});
