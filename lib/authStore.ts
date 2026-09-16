import { create } from "zustand";
import { pb } from "./pocketbase";
import type { RecordModel } from "pocketbase";

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  name?: string;
  avatar?: string;
  created?: string;
  updated?: string;
}

interface AuthState {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  initialize: () => void;
  login: (identity: string, password: string) => Promise<boolean>;
  register: (
    username: string,
    password: string,
    passwordConfirm: string,
    name?: string,
    email?: string,
    avatarFile?: File | null
  ) => Promise<boolean>;
  logout: () => void;
  updateAvatar: (file: File) => Promise<boolean>;
  updateProfile: (data: { name?: string; username?: string }) => Promise<boolean>;
  clearError: () => void;
  getAvatarUrl: (user?: UserProfile | null) => string;
}

function formatUser(model: RecordModel | null): UserProfile | null {
  if (!model) return null;
  const username =
    model.username ||
    (model.email ? model.email.split("@")[0] : "") ||
    (model.name ? model.name.toLowerCase().replace(/\s+/g, "") : "gamer");

  return {
    id: model.id,
    username: username,
    email: model.email || "",
    name: model.name || "",
    avatar: model.avatar || "",
    created: model.created,
    updated: model.updated,
  };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: typeof window !== "undefined" && pb.authStore.record ? formatUser(pb.authStore.record as RecordModel) : null,
  token: typeof window !== "undefined" ? pb.authStore.token : null,
  isAuthenticated: typeof window !== "undefined" ? pb.authStore.isValid : false,
  isLoading: false,
  error: null,

  initialize: () => {
    if (typeof window === "undefined") return;

    // Synchronize initial state
    set({
      user: pb.authStore.record ? formatUser(pb.authStore.record as RecordModel) : null,
      token: pb.authStore.token || null,
      isAuthenticated: pb.authStore.isValid,
    });

    // Listen to changes in authStore (e.g. token refresh, logout, update)
    pb.authStore.onChange((token, model) => {
      set({
        token: token || null,
        user: model ? formatUser(model as RecordModel) : null,
        isAuthenticated: !!token && pb.authStore.isValid,
      });
    });
  },

  login: async (identity: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const cleanIdentity = identity.trim();
      const authData = await pb.collection("users").authWithPassword(cleanIdentity, password);
      set({
        user: formatUser(authData.record),
        token: authData.token,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
      return true;
    } catch (err: any) {
      const message =
        err?.response?.message ||
        err?.message ||
        "Failed to log in. Please check your username/email and password.";
      set({ error: message, isLoading: false });
      return false;
    }
  },

  register: async (
    username: string,
    password: string,
    passwordConfirm: string,
    name?: string,
    email?: string,
    avatarFile?: File | null
  ) => {
    set({ isLoading: true, error: null });
    try {
      const cleanUsername = username.trim().toLowerCase();
      // If no email is provided, generate a default format required by PB if email rule is strict
      const cleanEmail = email?.trim() || `${cleanUsername}@fitrepacks.local`;
      const cleanName = name?.trim() || username.trim();

      // Use FormData if an avatar file is attached, else standard JSON payload
      let createPayload: any;
      if (avatarFile) {
        const formData = new FormData();
        formData.append("username", cleanUsername);
        formData.append("email", cleanEmail);
        formData.append("password", password);
        formData.append("passwordConfirm", passwordConfirm);
        if (cleanName) formData.append("name", cleanName);
        formData.append("avatar", avatarFile);
        createPayload = formData;
      } else {
        createPayload = {
          username: cleanUsername,
          email: cleanEmail,
          password,
          passwordConfirm,
          name: cleanName,
        };
      }

      await pb.collection("users").create(createPayload);

      // Auto login after successful registration
      const authData = await pb.collection("users").authWithPassword(cleanUsername, password);
      set({
        user: formatUser(authData.record),
        token: authData.token,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
      return true;
    } catch (err: any) {
      let message = "Registration failed.";
      if (err?.response?.data && typeof err.response.data === "object") {
        const errors = err.response.data;
        const details = Object.entries(errors)
          .map(([key, val]: [string, any]) => {
            const rawMsg = val?.message || (typeof val === "string" ? val : JSON.stringify(val));
            if (key === "email" && String(rawMsg).toLowerCase().includes("unique")) {
              return "An account with this email address already exists. Please switch to Sign In.";
            }
            if (key === "username" && String(rawMsg).toLowerCase().includes("unique")) {
              return "This username is already taken. Please choose another username.";
            }
            return `${key}: ${rawMsg}`;
          })
          .join(". ");
        message = details || err.response.message || message;
      } else if (err?.message) {
        message = err.message;
      }
      set({ error: message, isLoading: false });
      return false;
    }
  },

  logout: () => {
    pb.authStore.clear();
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      error: null,
    });
  },

  updateAvatar: async (file: File) => {
    const currentUser = get().user;
    if (!currentUser) return false;

    set({ isLoading: true, error: null });
    try {
      const formData = new FormData();
      formData.append("avatar", file);

      const updatedRecord = await pb.collection("users").update(currentUser.id, formData);
      set({
        user: formatUser(updatedRecord),
        isLoading: false,
      });
      return true;
    } catch (err: any) {
      const message = err?.response?.message || err?.message || "Failed to update avatar.";
      set({ error: message, isLoading: false });
      return false;
    }
  },

  updateProfile: async (data: { name?: string; username?: string }) => {
    const currentUser = get().user;
    if (!currentUser) return false;

    set({ isLoading: true, error: null });
    try {
      const payload: Record<string, string> = {};
      if (data.name !== undefined) payload.name = data.name.trim();
      if (data.username !== undefined) payload.username = data.username.trim();

      const updatedRecord = await pb.collection("users").update(currentUser.id, payload);
      set({
        user: formatUser(updatedRecord),
        isLoading: false,
      });
      return true;
    } catch (err: any) {
      const message = err?.response?.message || err?.message || "Failed to update profile.";
      set({ error: message, isLoading: false });
      return false;
    }
  },

  clearError: () => set({ error: null }),

  getAvatarUrl: (user?: UserProfile | null) => {
    const targetUser = user !== undefined ? user : get().user;
    if (!targetUser) {
      return "https://api.dicebear.com/7.x/bottts/svg?seed=gamer";
    }

    if (targetUser.avatar) {
      // If it's already an absolute URL (e.g. preset or external)
      if (targetUser.avatar.startsWith("http://") || targetUser.avatar.startsWith("https://")) {
        return targetUser.avatar;
      }
      try {
        // Construct PB record format for getURL
        const pbRecord = {
          id: targetUser.id,
          collectionId: "users",
          collectionName: "users",
          avatar: targetUser.avatar,
        };
        return pb.files.getURL(pbRecord as any, targetUser.avatar);
      } catch {
        // Fallback
      }
    }

    // Default Gamer Avatar generated dynamically based on username
    return `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
      targetUser.username || "gamer"
    )}`;
  },
}));
