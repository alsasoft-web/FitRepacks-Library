"use client";

import { useState } from "react";
import {
  Modal,
  Tabs,
  TextInput,
  PasswordInput,
  Button,
  Stack,
  Group,
  Text,
  Alert,
  Avatar,
  FileButton,
  ActionIcon,
  Box,
  Divider,
} from "@mantine/core";
import {
  User,
  Lock,
  Mail,
  AlertCircle,
  Upload,
  UserPlus,
  LogIn,
  Sparkles,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import { useAuthStore } from "../../lib/authStore";

interface AuthModalProps {
  opened: boolean;
  onClose: () => void;
  initialTab?: "login" | "register";
}

export function AuthModal({ opened, onClose, initialTab = "login" }: AuthModalProps) {
  const [activeTab, setActiveTab] = useState<string | null>(initialTab);

  // Login form state
  const [loginIdentity, setLoginIdentity] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register form state
  const [regUsername, setRegUsername] = useState("");
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPasswordConfirm, setRegPasswordConfirm] = useState("");
  const [regAvatarFile, setRegAvatarFile] = useState<File | null>(null);
  const [regAvatarPreview, setRegAvatarPreview] = useState<string | null>(null);

  // Store
  const { login, register, isLoading, error, clearError } = useAuthStore();
  const [validationError, setValidationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleClose = () => {
    clearError();
    setValidationError(null);
    setSuccessMessage(null);
    onClose();
  };

  const handleAvatarSelect = (file: File | null) => {
    if (file) {
      setRegAvatarFile(file);
      const url = URL.createObjectURL(file);
      setRegAvatarPreview(url);
    }
  };

  const handleClearAvatar = () => {
    setRegAvatarFile(null);
    if (regAvatarPreview) {
      URL.revokeObjectURL(regAvatarPreview);
      setRegAvatarPreview(null);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    clearError();

    if (!loginIdentity.trim()) {
      setValidationError("Please enter your username or email");
      return;
    }
    if (!loginPassword) {
      setValidationError("Please enter your password");
      return;
    }

    const success = await login(loginIdentity, loginPassword);
    if (success) {
      setSuccessMessage("Logged in successfully!");
      setTimeout(() => {
        handleClose();
      }, 600);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    clearError();

    const username = regUsername.trim().toLowerCase();
    if (!username) {
      setValidationError("Please enter a username");
      return;
    }
    if (username.length < 3) {
      setValidationError("Username must be at least 3 characters long");
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      setValidationError("Username can only contain letters, numbers, underscores and hyphens");
      return;
    }
    if (!regPassword) {
      setValidationError("Please enter a password");
      return;
    }
    if (regPassword.length < 8) {
      setValidationError("Password must be at least 8 characters long");
      return;
    }
    if (regPassword !== regPasswordConfirm) {
      setValidationError("Passwords do not match");
      return;
    }

    const success = await register(
      username,
      regPassword,
      regPasswordConfirm,
      regName.trim() || undefined,
      regEmail.trim() || undefined,
      regAvatarFile
    );

    if (success) {
      setSuccessMessage("Account created successfully!");
      setTimeout(() => {
        handleClose();
      }, 700);
    }
  };

  const displayError = validationError || error;

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Group gap="xs">
          <Sparkles size={18} color="var(--mantine-color-blue-4)" />
          <Text fw={700} size="md">
            {activeTab === "login" ? "Sign In" : "Create Account"}
          </Text>
        </Group>
      }
      centered
      radius="lg"
      size="md"
      overlayProps={{
        backgroundOpacity: 0.6,
        blur: 5,
      }}
    >
      <Tabs
        value={activeTab}
        onChange={(val) => {
          setActiveTab(val);
          clearError();
          setValidationError(null);
        }}
        variant="pills"
        radius="md"
        mb="md"
      >
        <Tabs.List grow>
          <Tabs.Tab value="login" leftSection={<LogIn size={15} />}>
            Sign In
          </Tabs.Tab>
          <Tabs.Tab value="register" leftSection={<UserPlus size={15} />}>
            Register
          </Tabs.Tab>
        </Tabs.List>

        {displayError && (
          <Alert
            icon={<AlertCircle size={16} />}
            color="red"
            variant="light"
            radius="md"
            mt="md"
          >
            {displayError}
          </Alert>
        )}

        {successMessage && (
          <Alert
            icon={<CheckCircle2 size={16} />}
            color="teal"
            variant="light"
            radius="md"
            mt="md"
          >
            {successMessage}
          </Alert>
        )}

        {/* LOGIN TAB */}
        <Tabs.Panel value="login" pt="sm">
          <form onSubmit={handleLoginSubmit}>
            <Stack gap="sm">
              <TextInput
                label="Username or Email"
                placeholder="Username or email"
                leftSection={<User size={16} color="#909296" />}
                value={loginIdentity}
                onChange={(e) => setLoginIdentity(e.target.value)}
                required
                autoFocus
                radius="md"
              />

              <PasswordInput
                label="Password"
                placeholder="Password"
                leftSection={<Lock size={16} color="#909296" />}
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
                radius="md"
              />

              <Button
                type="submit"
                fullWidth
                color="blue"
                mt="sm"
                radius="md"
                loading={isLoading}
                leftSection={<LogIn size={16} />}
              >
                Sign In
              </Button>

              <Text size="xs" c="dimmed" ta="center" mt="xs">
                Don&apos;t have an account?{" "}
                <Text
                  component="span"
                  c="blue.4"
                  style={{ cursor: "pointer", fontWeight: 600 }}
                  onClick={() => {
                    setActiveTab("register");
                    clearError();
                    setValidationError(null);
                  }}
                >
                  Create one
                </Text>
              </Text>
            </Stack>
          </form>
        </Tabs.Panel>

        {/* REGISTER TAB */}
        <Tabs.Panel value="register" pt="sm">
          <form onSubmit={handleRegisterSubmit}>
            <Stack gap="xs">
              {/* Optional Avatar upload preview */}
              <Box
                p="xs"
                style={{
                  borderRadius: 12,
                  border: "1px dashed var(--mantine-color-default-border)",
                  backgroundColor: "var(--mantine-color-default)",
                }}
              >
                <Group justify="space-between" align="center">
                  <Group gap="sm">
                    <Avatar
                      src={
                        regAvatarPreview ||
                        (regUsername
                          ? `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(regUsername)}`
                          : "https://api.dicebear.com/7.x/bottts/svg?seed=gamer")
                      }
                      size={44}
                      radius="xl"
                    />
                    <Stack gap={2}>
                      <Text size="xs" fw={600}>
                        Avatar (Optional)
                      </Text>
                      <Text size="11px" c="dimmed">
                        Upload an image or keep the default avatar
                      </Text>
                    </Stack>
                  </Group>

                  <Group gap={6}>
                    <FileButton
                      onChange={handleAvatarSelect}
                      accept="image/png,image/jpeg,image/webp,image/gif"
                    >
                      {(props) => (
                        <Button
                          {...props}
                          variant="light"
                          color="blue"
                          size="xs"
                          radius="md"
                          leftSection={<Upload size={13} />}
                        >
                          {regAvatarFile ? "Change" : "Upload"}
                        </Button>
                      )}
                    </FileButton>

                    {regAvatarFile && (
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        size="sm"
                        radius="md"
                        onClick={handleClearAvatar}
                      >
                        <Trash2 size={14} />
                      </ActionIcon>
                    )}
                  </Group>
                </Group>
              </Box>

              <TextInput
                label="Username"
                placeholder="Choose a username"
                leftSection={<User size={16} color="#909296" />}
                value={regUsername}
                onChange={(e) => setRegUsername(e.target.value)}
                required
                radius="md"
                description="Letters, numbers, and hyphens"
              />

              <TextInput
                label="Display Name"
                placeholder="Your display name (optional)"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                radius="md"
              />

              <TextInput
                label="Email"
                placeholder="your@email.com (optional)"
                leftSection={<Mail size={16} color="#909296" />}
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                radius="md"
              />

              <PasswordInput
                label="Password"
                placeholder="At least 8 characters"
                leftSection={<Lock size={16} color="#909296" />}
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                required
                radius="md"
              />

              <PasswordInput
                label="Confirm Password"
                placeholder="Confirm password"
                leftSection={<Lock size={16} color="#909296" />}
                value={regPasswordConfirm}
                onChange={(e) => setRegPasswordConfirm(e.target.value)}
                required
                radius="md"
              />

              <Button
                type="submit"
                fullWidth
                color="blue"
                mt="xs"
                radius="md"
                loading={isLoading}
                leftSection={<UserPlus size={16} />}
              >
                Create Account
              </Button>

              <Text size="xs" c="dimmed" ta="center">
                Already have an account?{" "}
                <Text
                  component="span"
                  c="blue.4"
                  style={{ cursor: "pointer", fontWeight: 600 }}
                  onClick={() => {
                    setActiveTab("login");
                    clearError();
                    setValidationError(null);
                  }}
                >
                  Sign In
                </Text>
              </Text>
            </Stack>
          </form>
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}
