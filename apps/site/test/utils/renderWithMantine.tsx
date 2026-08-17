import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { render, RenderOptions } from '@testing-library/react';
import { ComponentProps, ReactElement } from 'react';

type MantineProviderOptions = Pick<ComponentProps<typeof MantineProvider>, 'env'>;

export const renderWithMantine = (
  ui: ReactElement,
  options?: RenderOptions,
  providerOptions?: MantineProviderOptions,
) =>
  render(
    <MantineProvider {...providerOptions}>
      <ModalsProvider>
        <Notifications />
        {ui}
      </ModalsProvider>
    </MantineProvider>,
    options,
  );

