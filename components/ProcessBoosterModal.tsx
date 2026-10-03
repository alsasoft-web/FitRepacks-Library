"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Modal,
  Button,
  Checkbox,
  Group,
  Stack,
  Text,
  Badge,
  Table,
  ScrollArea,
  TextInput,
  Paper,
  ActionIcon,
  Alert,
  SegmentedControl,
} from "@mantine/core";
import {
  Search,
  RefreshCw,
  Zap,
  CheckCircle2,
  X,
  Layers,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

export interface ResourceProcess {
  pid: number;
  name: string;
  memory_mb: number;
  is_safe_to_kill: boolean;
  is_recommended: boolean;
}

interface ProcessBoosterModalProps {
  opened: boolean;
  onClose: () => void;
}

export const ProcessBoosterModal: React.FC<ProcessBoosterModalProps> = ({
  opened,
  onClose,
}) => {
  const [processes, setProcesses] = useState<ResourceProcess[]>([]);
  const [selectedPids, setSelectedPids] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [killing, setKilling] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewFilter, setViewFilter] = useState<"all" | "recommended">("all");
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const fetchProcesses = async () => {
    setLoading(true);
    setResultMessage(null);
    try {
      const list = await invoke<ResourceProcess[]>("get_resource_processes");
      setProcesses(list);
      // Pre-select recommended items
      const rec = list.filter((p) => p.is_recommended).map((p) => p.pid);
      setSelectedPids(rec);
    } catch (err) {
      console.error("Failed to fetch running processes:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (opened) {
      fetchProcesses();
      setSearchQuery("");
      setViewFilter("all");
    }
  }, [opened]);

  const filteredProcesses = useMemo(() => {
    return processes.filter((proc) => {
      const matchesSearch = proc.name
        .toLowerCase()
        .includes(searchQuery.toLowerCase().trim());
      const matchesFilter =
        viewFilter === "all" ? true : proc.is_recommended;
      return matchesSearch && matchesFilter;
    });
  }, [processes, searchQuery, viewFilter]);

  const totalSelectedMb = useMemo(() => {
    return processes
      .filter((p) => selectedPids.includes(p.pid))
      .reduce((acc, p) => acc + p.memory_mb, 0);
  }, [processes, selectedPids]);

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      const pidsToAdd = filteredProcesses.map((p) => p.pid);
      setSelectedPids((prev) => Array.from(new Set([...prev, ...pidsToAdd])));
    } else {
      const pidsToRemove = new Set(filteredProcesses.map((p) => p.pid));
      setSelectedPids((prev) => prev.filter((id) => !pidsToRemove.has(id)));
    }
  };

  const handleKill = async () => {
    if (selectedPids.length === 0) return;
    setKilling(true);
    setResultMessage(null);
    try {
      const count = await invoke<number>("kill_processes", {
        pids: selectedPids,
      });
      setResultMessage(
        `Successfully closed ${count} process${count === 1 ? "" : "es"} and freed memory.`
      );
      await fetchProcesses();
    } catch (err) {
      console.error("Failed to close processes:", err);
      setResultMessage("An error occurred while terminating processes.");
    } finally {
      setKilling(false);
    }
  };

  const isAllFilteredSelected =
    filteredProcesses.length > 0 &&
    filteredProcesses.every((p) => selectedPids.includes(p.pid));

  const isSomeFilteredSelected =
    filteredProcesses.some((p) => selectedPids.includes(p.pid)) &&
    !isAllFilteredSelected;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <Zap size={20} color="#f59f00" />
          <Text fw={700} size="lg">
            Resource Booster & Process Cleaner
          </Text>
        </Group>
      }
      size="xl"
      radius="md"
      centered
    >
      <Stack gap="md">
        {resultMessage && (
          <Alert
            icon={<CheckCircle2 size={16} />}
            title="Clean Up Result"
            color="teal"
            radius="md"
            withCloseButton
            onClose={() => setResultMessage(null)}
          >
            {resultMessage}
          </Alert>
        )}

        <Paper p="sm" radius="md" withBorder bg="var(--mantine-color-dark-6)">
          <Group justify="space-between" align="center">
            <Stack gap={2}>
              <Text size="sm" fw={600}>
                Reclaimable System Memory
              </Text>
              <Text size="xs" c="dimmed">
                Safely close non-essential background processes before playing.
              </Text>
            </Stack>
            <Group gap="xs">
              <Badge size="lg" color="yellow" variant="light">
                {selectedPids.length} selected
              </Badge>
              <Badge size="xl" color="teal" variant="filled">
                {(totalSelectedMb / 1024).toFixed(2)} GB RAM
              </Badge>
            </Group>
          </Group>
        </Paper>

        <Group justify="space-between" align="center">
          <Group gap="xs" style={{ flex: 1 }}>
            <TextInput
              placeholder="Search running processes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftSection={<Search size={14} />}
              rightSection={
                searchQuery ? (
                  <ActionIcon
                    size="xs"
                    variant="subtle"
                    onClick={() => setSearchQuery("")}
                  >
                    <X size={12} />
                  </ActionIcon>
                ) : null
              }
              size="xs"
              style={{ flex: 1, maxWidth: 260 }}
            />
            <SegmentedControl
              size="xs"
              value={viewFilter}
              onChange={(v) => setViewFilter(v as any)}
              data={[
                { label: "All Processes", value: "all" },
                { label: "Recommended", value: "recommended" },
              ]}
            />
          </Group>

          <Group gap="xs">
            <Button
              variant="light"
              size="xs"
              color="gray"
              leftSection={<RefreshCw size={14} />}
              onClick={fetchProcesses}
              loading={loading}
            >
              Refresh
            </Button>
            <Button
              variant="subtle"
              size="xs"
              color="blue"
              onClick={() => {
                const rec = processes
                  .filter((p) => p.is_recommended)
                  .map((p) => p.pid);
                setSelectedPids(rec);
              }}
            >
              Select Recommended
            </Button>
          </Group>
        </Group>

        <Paper withBorder radius="md">
          <ScrollArea.Autosize mah={360}>
            <Table striped highlightOnHover verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={40}>
                    <Checkbox
                      checked={isAllFilteredSelected}
                      indeterminate={isSomeFilteredSelected}
                      onChange={(e) => toggleSelectAll(e.currentTarget.checked)}
                      aria-label="Select all"
                    />
                  </Table.Th>
                  <Table.Th>Process Name</Table.Th>
                  <Table.Th w={90}>PID</Table.Th>
                  <Table.Th w={130} style={{ textAlign: "right" }}>
                    Memory (RAM)
                  </Table.Th>
                  <Table.Th w={140}>Classification</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filteredProcesses.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={5} style={{ textAlign: "center" }} py="xl">
                      <Stack align="center" gap="xs">
                        <Layers size={28} color="#909296" />
                        <Text size="sm" c="dimmed">
                          {loading
                            ? "Scanning running processes..."
                            : "No heavy background processes found matching criteria."}
                        </Text>
                      </Stack>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  filteredProcesses.map((proc) => {
                    const isSelected = selectedPids.includes(proc.pid);
                    return (
                      <Table.Tr
                        key={proc.pid}
                        bg={
                          isSelected
                            ? "var(--mantine-color-blue-light)"
                            : undefined
                        }
                      >
                        <Table.Td>
                          <Checkbox
                            checked={isSelected}
                            onChange={(e) => {
                              const checked = e.currentTarget.checked;
                              setSelectedPids((prev) =>
                                checked
                                  ? [...prev, proc.pid]
                                  : prev.filter((id) => id !== proc.pid)
                              );
                            }}
                            aria-label={`Select ${proc.name}`}
                          />
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" fw={600}>
                            {proc.name}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs" c="dimmed" ff="monospace">
                            {proc.pid}
                          </Text>
                        </Table.Td>
                        <Table.Td style={{ textAlign: "right" }}>
                          <Text size="sm" fw={700} c="teal">
                            {proc.memory_mb >= 1024
                              ? `${(proc.memory_mb / 1024).toFixed(2)} GB`
                              : `${proc.memory_mb} MB`}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          {proc.is_recommended ? (
                            <Badge size="sm" color="teal" variant="light">
                              Recommended
                            </Badge>
                          ) : (
                            <Badge size="sm" color="gray" variant="subtle">
                              Optional
                            </Badge>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })
                )}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>
        </Paper>

        <Group justify="space-between" align="center" mt="xs">
          <Text size="xs" c="dimmed">
            Critical Windows system processes and active game binaries are protected.
          </Text>
          <Group gap="xs">
            <Button variant="default" onClick={onClose} disabled={killing}>
              Close
            </Button>
            <Button
              color="red"
              leftSection={<Zap size={16} />}
              onClick={handleKill}
              loading={killing}
              disabled={selectedPids.length === 0}
            >
              Free Resources ({selectedPids.length})
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
};
