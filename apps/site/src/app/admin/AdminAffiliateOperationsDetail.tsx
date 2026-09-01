"use client";

import { Badge, Drawer, Group, Paper, Stack, Table, Text, Title } from "@mantine/core";
import type {
  ProjectionDetail,
  ProjectionHistoryRow,
} from "@/types/affiliateOperations";
import {
  formatDate,
  historyActor,
  historyEvidence,
  statusColor,
} from "./AdminAffiliateOperationsFormatting";
import {
  Pager,
  ProjectionLink,
  TableFrame,
} from "./AdminAffiliateOperationsVisuals";

type DetailSection = ProjectionDetail["sections"][number];
type DetailField = DetailSection["fields"][number];
type RelatedRecord = ProjectionDetail["related"][number];

const DetailFieldValue = ({ field }: Readonly<{ field: DetailField }>) =>
  field.href ? (
    <ProjectionLink href={field.href}>{field.value}</ProjectionLink>
  ) : (
    field.value
  );

const DetailSectionView = ({
  section,
}: Readonly<{ section: DetailSection }>) => (
  <Paper withBorder p="sm" radius="sm">
    <Title order={5}>{section.title}</Title>
    <Stack gap={4} mt="xs">
      {section.fields.map((item) => (
        <Text key={item.label} size="sm">
          <Text span fw={700}>
            {item.label}:
          </Text>{" "}
          <DetailFieldValue field={item} />
        </Text>
      ))}
    </Stack>
  </Paper>
);

const DetailHistoryRow = ({
  row,
}: Readonly<{ row: ProjectionHistoryRow }>) => (
  <Table.Tr>
    <Table.Td>{formatDate(row.at)}</Table.Td>
    <Table.Td>
      <Text size="sm">
        {row.href ? (
          <ProjectionLink href={row.href}>{row.kind}</ProjectionLink>
        ) : (
          row.kind
        )}
      </Text>
      <Text size="xs" ff="monospace">
        {row.id}
      </Text>
    </Table.Td>
    <Table.Td>{row.status ?? "Not recorded"}</Table.Td>
    <Table.Td>{historyActor(row)}</Table.Td>
    <Table.Td>{historyEvidence(row)}</Table.Td>
    <Table.Td>{row.reason ?? "Not recorded"}</Table.Td>
  </Table.Tr>
);

const DetailHistory = ({ detail }: Readonly<{ detail: ProjectionDetail }>) => (
  <Paper withBorder p="sm" radius="sm">
    <Title order={5}>History</Title>
    {detail.history.length ? (
      <TableFrame>
        <Table striped style={{ minWidth: 720 }}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>When</Table.Th>
              <Table.Th>Record</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Actor</Table.Th>
              <Table.Th>Evidence</Table.Th>
              <Table.Th>Reason</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {detail.history.map((row) => (
              <DetailHistoryRow key={row.id} row={row} />
            ))}
          </Table.Tbody>
        </Table>
      </TableFrame>
    ) : (
      <Text size="sm" c="dimmed">
        Not recorded
      </Text>
    )}
    <Pager
      page={detail.historyPage ?? 1}
      pageSize={detail.historyPageSize ?? Math.max(1, detail.history.length)}
      total={detail.historyTotal ?? detail.history.length}
      queryKey="historyPage"
    />
  </Paper>
);

const RelatedRow = ({ row }: Readonly<{ row: RelatedRecord }>) => (
  <Group gap="xs" wrap="wrap">
    <Badge size="sm" variant="light">
      {row.kind}
    </Badge>
    <Text size="sm">
      {row.href ? (
        <ProjectionLink href={row.href}>{row.label}</ProjectionLink>
      ) : (
        row.label
      )}
    </Text>
    <Text size="sm" c="dimmed">
      {row.status ?? "Not recorded"}
    </Text>
  </Group>
);

const DetailRelated = ({ detail }: Readonly<{ detail: ProjectionDetail }>) => (
  <Paper withBorder p="sm" radius="sm">
    <Title order={5}>Related records</Title>
    {detail.related.length ? (
      <Stack gap={4}>
        {detail.related.map((row) => (
          <RelatedRow key={`${row.kind}:${row.id}`} row={row} />
        ))}
      </Stack>
    ) : (
      <Text size="sm" c="dimmed">
        Not recorded
      </Text>
    )}
  </Paper>
);

const DetailContent = ({ detail }: Readonly<{ detail: ProjectionDetail }>) => (
  <Stack gap="md">
    <Group justify="space-between" align="flex-start">
      <div>
        <Text size="sm" c="dimmed">
          {detail.subtitle}
        </Text>
        <Text size="xs" ff="monospace">
          {detail.id}
        </Text>
      </div>
      <Badge color={statusColor(detail.status)}>
        {detail.status ?? "Not recorded"}
      </Badge>
    </Group>
    {detail.sections.map((section) => (
      <DetailSectionView key={section.title} section={section} />
    ))}
    <DetailHistory detail={detail} />
    <DetailRelated detail={detail} />
  </Stack>
);

export const DetailDrawer = ({
  detail,
  isOpened,
  isLoading,
  isMobile,
  onClose,
}: Readonly<{
  detail: ProjectionDetail | null;
  isOpened: boolean;
  isLoading: boolean;
  isMobile: boolean;
  onClose: () => void;
}>) => {
  const body = detail ? (
    <DetailContent detail={detail} />
  ) : isLoading ? (
    <Text c="dimmed">Loading detail evidence…</Text>
  ) : (
    <Text c="dimmed">
      Detail evidence is not recorded for this selection.
    </Text>
  );
  return (
    <Drawer
      opened={isOpened}
      onClose={onClose}
      title={detail?.title ?? "Detail"}
      position="right"
      size={isMobile ? "100%" : "min(100vw, 620px)"}
    >
      {body}
    </Drawer>
  );
};
