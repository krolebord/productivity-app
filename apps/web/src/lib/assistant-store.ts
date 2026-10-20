import {
  type AssistantModelId,
  type AssistantReasoningEffort,
  DEFAULT_ASSISTANT_MODEL,
  isAssistantReasoningEffort,
  resolveAssistantModelId,
} from "@productivity/core/agent/models";
import { omitSubmitLock, type SubmitLock } from "@productivity/core/submit-lock";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type RightPanel = "assistant" | "today";

interface AssistantStore {
  activePanel: RightPanel | null;
  activeConversationId: string | null;
  /**
   * Assistant panel layer: the conversation list vs the open chat. Not persisted —
   * opening the panel always resumes the last chat.
   */
  showConversationList: boolean;
  /**
   * In-flight sends keyed by conversation id so switching chats or opening the
   * list does not unlock the composer before the user message and turn status
   * have synced. Not persisted.
   */
  submitLocks: Record<string, SubmitLock>;
  model: AssistantModelId;
  /** Preferred reasoning effort for GPT-5.6; null means use the model catalog default. */
  reasoningEffort: AssistantReasoningEffort | null;
  /**
   * Draft text for the message composer. Lifted into the store (rather than local
   * component state) so anything on the page can append context tokens to it — see
   * useAttachToAssistant. Not persisted: a half-written prompt shouldn't survive reloads.
   */
  inputDraft: string;
  /**
   * Bumped to request that the composer textarea take focus. The composer watches
   * this and focuses itself — lets off-screen actions (e.g. attaching context)
   * return focus to the input without holding a ref to it.
   */
  composerFocusNonce: number;
  openPanel: (panel: RightPanel) => void;
  closePanel: () => void;
  togglePanel: (panel: RightPanel) => void;
  openConversationList: () => void;
  setActiveConversation: (id: string | null) => void;
  /** Open a chat and leave the list. Used by the list, new-chat, and command palette. */
  openConversation: (id: string) => void;
  setSubmitLock: (id: string, lock: SubmitLock) => void;
  clearSubmitLock: (id: string) => void;
  setModel: (model: AssistantModelId) => void;
  setReasoningEffort: (effort: AssistantReasoningEffort | null) => void;
  setInputDraft: (value: string) => void;
  appendToInput: (text: string) => void;
  requestComposerFocus: () => void;
}

type PersistedAssistantState = Partial<AssistantStore> & {
  open?: boolean;
};

export const useAssistantStore = create<AssistantStore>()(
  persist(
    (set) => ({
      activePanel: null,
      activeConversationId: null,
      showConversationList: false,
      submitLocks: {},
      model: DEFAULT_ASSISTANT_MODEL,
      reasoningEffort: null,
      inputDraft: "",
      composerFocusNonce: 0,
      openPanel: (panel) =>
        set({
          activePanel: panel,
          ...(panel === "assistant" ? { showConversationList: false } : {}),
        }),
      closePanel: () => set({ activePanel: null }),
      togglePanel: (panel) =>
        set((s) => {
          const closing = s.activePanel === panel;
          return {
            activePanel: closing ? null : panel,
            ...(panel === "assistant" && !closing ? { showConversationList: false } : {}),
          };
        }),
      openConversationList: () => set({ showConversationList: true }),
      setActiveConversation: (id) => set({ activeConversationId: id }),
      openConversation: (id) =>
        set({
          activeConversationId: id,
          showConversationList: false,
        }),
      setSubmitLock: (id, lock) => set((s) => ({ submitLocks: { ...s.submitLocks, [id]: lock } })),
      clearSubmitLock: (id) => set((s) => ({ submitLocks: omitSubmitLock(s.submitLocks, id) })),
      setModel: (model) => set({ model }),
      setReasoningEffort: (reasoningEffort) => set({ reasoningEffort }),
      setInputDraft: (inputDraft) => set({ inputDraft }),
      appendToInput: (text) =>
        set((s) => {
          const needsSpace = s.inputDraft.length > 0 && !/\s$/.test(s.inputDraft);
          return { inputDraft: `${s.inputDraft}${needsSpace ? " " : ""}${text} ` };
        }),
      requestComposerFocus: () => set((s) => ({ composerFocusNonce: s.composerFocusNonce + 1 })),
    }),
    {
      name: "productivity-assistant",
      partialize: (state) => ({
        activePanel: state.activePanel,
        activeConversationId: state.activeConversationId,
        model: state.model,
        reasoningEffort: state.reasoningEffort,
      }),
      merge: (persisted, current) => {
        const raw = (persisted ?? {}) as PersistedAssistantState;
        const { open, ...rest } = raw;
        let activePanel = current.activePanel;
        if ("activePanel" in rest) {
          activePanel = rest.activePanel ?? null;
        } else if (typeof open === "boolean") {
          activePanel = open ? "assistant" : null;
        }
        const state = { ...current, ...rest, activePanel };
        return {
          ...state,
          showConversationList: false,
          submitLocks: {},
          model: resolveAssistantModelId(state.model),
          reasoningEffort: isAssistantReasoningEffort(state.reasoningEffort) ? state.reasoningEffort : null,
        };
      },
    },
  ),
);
