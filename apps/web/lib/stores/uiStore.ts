import { create } from 'zustand';

export interface SecondarySidebarItem {
    name: string;
    href: string;
}

export interface SecondarySidebarConfig {
    /** Shown as the panel heading */
    title: string;
    /** Small breadcrumb line above the title, e.g. course code */
    subtitle?: string;
    /** href for the "← back" link */
    backHref: string;
    /** Label for the back link */
    backLabel: string;
    /** Nav items — hrefs should be absolute */
    items: SecondarySidebarItem[];
    /** Used to compute active state (exact match = first item) */
    basePath: string;
    /**
     * 'nav'   — standard link list (default)
     * 'steps' — assignment-creation progress steps (reads from assignmentCreateStore)
     */
    mode?: 'nav' | 'steps';
}

interface UIState {
    pageTitle: string | null;
    setPageTitle: (title: string | null) => void;

    /** Currently visible config (top of the stack, or null) */
    secondarySidebar: SecondarySidebarConfig | null;
    /** Force-set the sidebar (admin/legacy usage — does not touch the stack) */
    setSecondarySidebar: (config: SecondarySidebarConfig | null) => void;

    /** Stack-based API for nested layouts (instructor pattern).
     *  Each layout pushes on mount and pops on unmount so that
     *  navigating back always restores the parent context. */
    _sidebarStack: SecondarySidebarConfig[];
    pushSecondarySidebar: (config: SecondarySidebarConfig) => void;
    popSecondarySidebar: () => void;
    /** Replace the top of the stack in-place (e.g. after async title fetch) */
    updateTopSecondarySidebar: (config: SecondarySidebarConfig) => void;
}

export const useUIStore = create<UIState>((set) => ({
    pageTitle: null,
    setPageTitle: (title) => set({ pageTitle: title }),

    secondarySidebar: null,
    setSecondarySidebar: (config) => set({ secondarySidebar: config }),

    _sidebarStack: [],
    pushSecondarySidebar: (config) =>
        set((state) => {
            const newStack = [...state._sidebarStack, config];
            return { _sidebarStack: newStack, secondarySidebar: newStack[newStack.length - 1] };
        }),
    popSecondarySidebar: () =>
        set((state) => {
            const newStack = state._sidebarStack.slice(0, -1);
            return {
                _sidebarStack: newStack,
                secondarySidebar: newStack.length > 0 ? newStack[newStack.length - 1] : null,
            };
        }),
    updateTopSecondarySidebar: (config) =>
        set((state) => {
            if (state._sidebarStack.length === 0) return {};
            const newStack = [...state._sidebarStack];
            newStack[newStack.length - 1] = config;
            return { _sidebarStack: newStack, secondarySidebar: config };
        }),
}));
