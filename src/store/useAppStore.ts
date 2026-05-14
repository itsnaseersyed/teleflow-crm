import { create } from 'zustand';

interface AppState {
  // Sidebar/UI state
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  
  // Active Lead/Call state
  activeLeadId: string | null;
  setActiveLeadId: (id: string | null) => void;
  
  // Filters
  leadFilterStatus: string;
  setLeadFilterStatus: (status: string) => void;
  
  // Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarOpen: true,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  
  activeLeadId: null,
  setActiveLeadId: (activeLeadId) => set({ activeLeadId }),
  
  leadFilterStatus: "All",
  setLeadFilterStatus: (leadFilterStatus) => set({ leadFilterStatus }),
  
  searchQuery: "",
  setSearchQuery: (searchQuery) => set({ searchQuery }),
}));
