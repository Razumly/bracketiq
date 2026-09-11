'use client';

import type { ReactNode } from 'react';
import { Button, Modal } from '@/components/organization/organization-operation-ui';

type DiscoverFiltersModalProps = {
  opened: boolean;
  onClose: () => void;
  onClearAll: () => void;
  children: ReactNode;
};

export default function DiscoverFiltersModal({ opened, onClose, onClearAll, children }: DiscoverFiltersModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Filters"
      size="lg"
      styles={{
        content: { width: 'min(42rem, calc(100vw - 2rem))', maxHeight: 'calc(100dvh - 2rem)', display: 'flex', flexDirection: 'column' },
        body: { minHeight: 0, display: 'flex', flexDirection: 'column' },
      }}
    >
      <div className="discover-filters-modal">
        <div className="discover-filters-modal-content">{children}</div>
        <div className="discover-filters-modal-footer">
          <Button type="button" variant="subtle" onClick={onClearAll}>Clear all</Button>
          <Button type="button" radius="xl" onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}
