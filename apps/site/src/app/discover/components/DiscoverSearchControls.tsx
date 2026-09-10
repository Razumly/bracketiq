'use client';

import { MapPinned, Plus, Search } from 'lucide-react';
import {
  Button,
  Group,
  Text,
  TextInput,
} from '@/components/organization/organization-operation-ui';
import LocationSearch from '@/components/location/LocationSearch';

type DiscoverSearchControlsProps = {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  onSearch: () => void;
  onOpenMap?: () => void;
  onCreateEvent?: () => void;
  showCreateEventButton?: boolean;
  createEventDisabled?: boolean;
  createEventHelperText?: string | null;
  searchLabel?: string;
};

export default function DiscoverSearchControls({
  value,
  onValueChange,
  placeholder = 'Search discover...',
  onSearch,
  onOpenMap,
  onCreateEvent,
  showCreateEventButton = true,
  createEventDisabled = false,
  createEventHelperText = null,
  searchLabel = 'Search',
}: DiscoverSearchControlsProps) {
  return (
    <Group
      align="center"
      gap="sm"
      wrap="wrap"
      className="discover-search-controls"
      style={{ minWidth: 0, width: '100%', maxWidth: '100%' }}
    >
      <form
        className="discover-search-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch();
        }}
      >
        <TextInput
          aria-label={searchLabel}
          value={value}
          onChange={(event) => onValueChange(event.currentTarget.value)}
          placeholder={placeholder}
          leftSection={<Search aria-hidden="true" size={16} />}
          className="min-w-0 flex-1"
        />
        <Button
          type="submit"
          variant="outline"
          size="icon"
          aria-label={searchLabel}
          className="discover-search-submit"
        >
          <Search aria-hidden="true" size={16} />
        </Button>
      </form>
      <Group gap="xs" wrap="wrap" className="discover-search-actions">
        <LocationSearch />
        {onOpenMap && (
          <Button variant="outline" onClick={onOpenMap} leftSection={<MapPinned aria-hidden="true" size={16} />}>
            Map
          </Button>
        )}
        {onCreateEvent && showCreateEventButton && (
          <Button
            onClick={onCreateEvent}
            disabled={createEventDisabled}
            leftSection={<Plus aria-hidden="true" size={16} />}
            className="discover-create-event"
          >
            Create event
          </Button>
        )}
      </Group>
      {createEventHelperText && (
        <Text size="xs" c={createEventDisabled ? 'red' : 'dimmed'} className="w-full">
          {createEventHelperText}
        </Text>
      )}
    </Group>
  );
}
