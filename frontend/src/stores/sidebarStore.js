import { create } from 'zustand'

export const useSidebarStore = create(set => ({
  open: !window.matchMedia('(max-width: 767px)').matches,
  toggle: () => set(s => ({ open: !s.open })),
  close: () => set({ open: false }),
  openSidebar: () => set({ open: true }),
}))
