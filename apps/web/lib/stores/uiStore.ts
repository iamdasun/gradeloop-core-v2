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
}

interface UIState {
    pageTitle: string | null;
    setPageTitle: (title: string | null) => void;

    secondarySidebar: SecondarySidebarConfig | null;
    setSecondarySidebar: (config: SecondarySidebarConfig | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
    pageTitle: null,
    setPageTitle: (title) => set({ pageTitle: title }),

    secondarySidebar: null,
    setSecondarySidebar: (config) => set({ secondarySidebar: config }),
}));
