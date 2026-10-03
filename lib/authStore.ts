import { create } from "zustand";
import { ab } from "./alsabase";
import type { RecordModel } from "alsabase";

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
  refreshProfile: () => Promise<void>;
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
  updateAvatar: (fileOrUrl: File | string) => Promise<boolean>;
  updateProfile: (data: { name?: string; username?: string; avatar?: string }) => Promise<boolean>;
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
    created: model.created || (model as any).created_at,
    updated: model.updated || (model as any).updated_at,
  };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: typeof window !== "undefined" && ab.authStore.model ? formatUser(ab.authStore.model as RecordModel) : null,
  token: typeof window !== "undefined" ? ab.authStore.token : null,
  isAuthenticated: typeof window !== "undefined" ? ab.authStore.isValid : false,
  isLoading: false,
  error: null,

  initialize: () => {
    if (typeof window === "undefined") return;

    // Synchronize initial state
    const currentModel = ab.authStore.model as RecordModel | null;
    set({
      user: currentModel ? formatUser(currentModel) : null,
      token: ab.authStore.token || null,
      isAuthenticated: ab.authStore.isValid,
    });

    // If authenticated, fetch the actual collection fields (name, avatar, etc.) to ensure complete profile data
    if (ab.authStore.isValid && currentModel?.id) {
      ab.collection("users")
        .getOne(currentModel.id)
        .then((fetched) => {
          if (fetched) {
            const merged = { ...currentModel, ...fetched };
            if (ab.authStore.token) {
              ab.authStore.save(ab.authStore.token, merged);
            }
            set({
              user: formatUser(merged),
            });
          }
        })
        .catch(() => {});
    }

    // Listen to changes in authStore (e.g. token refresh, logout, update)
    ab.authStore.onChange((token, model) => {
      set({
        token: token || null,
        user: model ? formatUser(model as RecordModel) : null,
        isAuthenticated: !!token && ab.authStore.isValid,
      });
    });
  },

  refreshProfile: async () => {
    const currentUser = get().user;
    if (!currentUser?.id || !ab.authStore.isValid) return;
    try {
      const fetched = await ab.collection("users").getOne(currentUser.id);
      if (fetched) {
        const merged = { ...(ab.authStore.model || {}), ...fetched };
        if (ab.authStore.token) {
          ab.authStore.save(ab.authStore.token, merged);
        }
        set({ user: formatUser(merged) });
      }
    } catch (_) {}
  },

  login: async (identity: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const cleanIdentity = identity.trim();
      const authData = await ab.collection("users").authWithPassword(cleanIdentity, password);

      // Fetch full collection record with name, avatar, and other fields
      let fullRecord = authData.record;
      try {
        const fetched = await ab.collection("users").getOne(authData.record.id);
        if (fetched) {
          fullRecord = { ...authData.record, ...fetched };
          if (authData.token) {
            ab.authStore.save(authData.token, fullRecord);
          }
        }
      } catch (_) {}

      set({
        user: formatUser(fullRecord),
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

      await ab.collection("users").create(createPayload);

      // Auto login after successful registration
      const authData = await ab.collection("users").authWithPassword(cleanUsername, password);

      // Fetch full collection record with all fields
      let fullRecord = authData.record;
      try {
        const fetched = await ab.collection("users").getOne(authData.record.id);
        if (fetched) {
          fullRecord = { ...authData.record, ...fetched };
          if (authData.token) {
            ab.authStore.save(authData.token, fullRecord);
          }
        }
      } catch (_) {}

      set({
        user: formatUser(fullRecord),
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
    ab.authStore.clear();
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      error: null,
    });
  },

  updateAvatar: async (fileOrUrl: File | string) => {
    const currentUser = get().user;
    if (!currentUser) return false;

    set({ isLoading: true, error: null });
    try {
      let payload: FormData | Record<string, string>;
      if (typeof fileOrUrl === "string") {
        payload = { avatar: fileOrUrl };
      } else {
        const formData = new FormData();
        formData.append("avatar", fileOrUrl);
        payload = formData;
      }

      const updatedRecord = await ab.collection("users").update(currentUser.id, payload);
      let fullRecord = updatedRecord;
      try {
        const fetched = await ab.collection("users").getOne(currentUser.id);
        if (fetched) {
          fullRecord = { ...updatedRecord, ...fetched };
        }
      } catch (_) {}

      if (ab.authStore.token) {
        ab.authStore.save(ab.authStore.token, fullRecord);
      }
      set({
        user: formatUser(fullRecord),
        isLoading: false,
      });
      return true;
    } catch (err: any) {
      const message = err?.response?.message || err?.message || "Failed to update avatar.";
      set({ error: message, isLoading: false });
      return false;
    }
  },

  updateProfile: async (data: { name?: string; username?: string; avatar?: string }) => {
    const currentUser = get().user;
    if (!currentUser) return false;

    set({ isLoading: true, error: null });
    try {
      const payload: Record<string, string> = {};
      if (data.name !== undefined) payload.name = data.name.trim();
      if (data.username !== undefined) payload.username = data.username.trim();
      if (data.avatar !== undefined) payload.avatar = data.avatar;

      const updatedRecord = await ab.collection("users").update(currentUser.id, payload);
      let fullRecord = updatedRecord;
      try {
        const fetched = await ab.collection("users").getOne(currentUser.id);
        if (fetched) {
          fullRecord = { ...updatedRecord, ...fetched };
        }
      } catch (_) {}

      if (ab.authStore.token) {
        ab.authStore.save(ab.authStore.token, fullRecord);
      }
      set({
        user: formatUser(fullRecord),
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
        const abRecord = {
          id: targetUser.id,
          collectionId: "users",
          collectionName: "users",
          avatar: targetUser.avatar,
        };
        return ab.files.getUrl(abRecord, targetUser.avatar);
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
