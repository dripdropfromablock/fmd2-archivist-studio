import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SourceBrowseFilters } from '../utils/fmdLogic.ts';

export interface SavedFilterPreset {
  id: string;
  name: string;
  filters: SourceBrowseFilters;
  microTropes: string[];
}

interface FilterPresetStore {
  presets: SavedFilterPreset[];
  savePreset: (name: string, filters: SourceBrowseFilters, microTropes?: string[]) => void;
  deletePreset: (id: string) => void;
}

export const useFilterPresetStore = create<FilterPresetStore>()(
  persist(
    (set) => ({
      presets: [],
      savePreset: (name, filters, microTropes = []) =>
        set((state) => ({
          presets: [
            ...state.presets,
            {
              id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
                ? crypto.randomUUID()
                : `preset-${Date.now()}`,
              name: name.trim(),
              filters: { ...filters },
              microTropes: [...microTropes],
            },
          ],
        })),
      deletePreset: (id) => set((state) => ({ presets: state.presets.filter((preset) => preset.id !== id) })),
    }),
    { name: 'fmd2_discovery_filter_presets_v1' }
  )
);

