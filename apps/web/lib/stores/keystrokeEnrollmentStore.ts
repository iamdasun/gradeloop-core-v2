/**
 * Zustand store that tracks keystroke enrollment state.
 *
 * `dismissed` is persisted to localStorage keyed by userId so that
 * pressing "Later" is remembered per-user across page refreshes, but a
 * different user won't inherit the same dismissal.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface KeystrokeEnrollmentState {
    /** Map of userId → whether they pressed "Later" */
    dismissedByUser: Record<string, boolean>;
    /** Map of userId → whether enrollment check confirmed they're enrolled */
    enrolledByUser: Record<string, boolean>;

    /** Mark the prompt as dismissed ("Later") for a user */
    dismiss: (userId: string) => void;
    /** Record that the user is enrolled */
    setEnrolled: (userId: string, enrolled: boolean) => void;
    /** True if the user pressed "Later" */
    isDismissed: (userId: string) => boolean;
    /** True if the user is known to be enrolled */
    isEnrolled: (userId: string) => boolean;
}

export const useKeystrokeEnrollmentStore = create<KeystrokeEnrollmentState>()(
    persist(
        (set, get) => ({
            dismissedByUser: {},
            enrolledByUser: {},

            dismiss: (userId) =>
                set((s) => ({
                    dismissedByUser: { ...s.dismissedByUser, [userId]: true },
                })),

            setEnrolled: (userId, enrolled) =>
                set((s) => ({
                    enrolledByUser: { ...s.enrolledByUser, [userId]: enrolled },
                })),

            isDismissed: (userId) => get().dismissedByUser[userId] ?? false,

            isEnrolled: (userId) => get().enrolledByUser[userId] ?? false,
        }),
        {
            name: "keystroke-enrollment",
            storage: createJSONStorage(() => localStorage),
        }
    )
);
