import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  SlidersHorizontal,
  CheckSquare,
  Square,
  RotateCcw,
  ArrowLeft,
  BookOpen,
  FileText,
  ScrollText,
  Plus,
  X,
  Palette,
  Sparkles,
  Check,
  ChevronLeft,
  ChevronRight,
  Layers,
  Type,
} from 'lucide-react';
import {
  ALL_FMD2_SOURCES,
  DEFAULT_ENABLED_SOURCE_IDS,
  DEFAULT_WEBTOON_TRIGGER_TAGS,
  READING_MODES_META,
  APP_THEME_PRESETS,
  APPLE_FONT_PRESETS,
  ACCENT_COLOR_PRESETS,
  UI_ANIMATION_PRESETS,
  SURFACE_STYLE_PRESETS,
  DEFAULT_UI_THEME_PREFS,
  resolveSeriesReadingMode,
  filterFmdSourcesCatalogue,
  type SourceId,
  type FmdEngineConfig,
  type ArchiveFormat,
  type ReadingMode,
  type MangaSeries,
  type MangaChapter,
  type UiThemePreferences,
} from '../utils/fmdLogic.ts';
import { DropdownMenu, type DropdownMenuItem } from './DropdownMenu.tsx';

interface SourcesSettingsViewProps {
  enabledSources: SourceId[];
  onToggleSource: (sourceId: SourceId) => void;
  onSetEnabledSources: (sourceIds: SourceId[]) => void;
  engineConfig: FmdEngineConfig;
  onUpdateEngineConfig: (partial: Partial<FmdEngineConfig>) => void;
  onBackToCatalog: () => void;
  catalog?: MangaSeries[];
  onOpenSeriesInReader?: (series: MangaSeries, chapter: MangaChapter) => void;
  themePrefs?: UiThemePreferences;
  onUpdateThemePrefs?: (partial: Partial<UiThemePreferences>) => void;
}

const CATEGORIES = [
  'All',
  'Manga & Manhwa',
  'Webtoon & Manhua',
  'Aggregator',
  'Raw & Official',
  'International',
] as const;

const TEMPLATES = [
  'All',
  'Madara',
  'MangaStream',
  'Core',
  'Custom',
  'FlatManga',
  'FoolSlide',
  'WPComics',
] as const;

const LANGUAGES = [
  'All',
  'EN',
  'Multi',
  'JA',
  'KO',
  'ZH',
  'ES',
  'PT',
  'FR',
  'ID',
  'RU',
  'VI',
  'AR',
  'DE',
  'IT',
] as const;

const PAGE_SIZE = 75;

export const SourcesSettingsView: React.FC<SourcesSettingsViewProps> = ({
  enabledSources,
  onToggleSource,
  onSetEnabledSources,
  engineConfig,
  onUpdateEngineConfig,
  onBackToCatalog,
  catalog = [],
  onOpenSeriesInReader,
  themePrefs = DEFAULT_UI_THEME_PREFS,
  onUpdateThemePrefs,
}) => {
  const [sourceSearch, setSourceSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [templateFilter, setTemplateFilter] = useState<string>('All');
  const [languageFilter, setLanguageFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [customTagInput, setCustomTagInput] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showAllRows, setShowAllRows] = useState(false);

  const autoDetectReadingMode = engineConfig.autoDetectReadingMode !== false;
  const defaultReadingMode: ReadingMode = engineConfig.defaultReadingMode || 'single';
  const webtoonTriggerTags = useMemo(
    () =>
      Array.isArray(engineConfig.webtoonTriggerTags)
        ? engineConfig.webtoonTriggerTags
        : DEFAULT_WEBTOON_TRIGGER_TAGS,
    [engineConfig.webtoonTriggerTags]
  );

  const handleToggleAutoDetectMode = () => {
    onUpdateEngineConfig({ autoDetectReadingMode: !autoDetectReadingMode });
  };

  const handleToggleWebtoonTriggerTag = (tag: string) => {
    const lower = tag.trim().toLowerCase();
    const exists = webtoonTriggerTags.some((t) => t.trim().toLowerCase() === lower);
    const next = exists
      ? webtoonTriggerTags.filter((t) => t.trim().toLowerCase() !== lower)
      : [...webtoonTriggerTags, tag.trim()];
    onUpdateEngineConfig({ webtoonTriggerTags: next });
  };

  const handleAddCustomTriggerTag = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customTagInput.trim();
    if (!clean) return;
    if (!webtoonTriggerTags.some((t) => t.toLowerCase() === clean.toLowerCase())) {
      onUpdateEngineConfig({ webtoonTriggerTags: [...webtoonTriggerTags, clean] });
    }
    setCustomTagInput('');
  };

  const handleResetTriggerTags = () => {
    onUpdateEngineConfig({
      autoDetectReadingMode: true,
      defaultReadingMode: 'single',
      webtoonTriggerTags: [...DEFAULT_WEBTOON_TRIGGER_TAGS],
    });
  };

  const previewSeriesList = useMemo(() => {
    return catalog.slice(0, 6);
  }, [catalog]);

  const enabledSet = useMemo(() => new Set(enabledSources), [enabledSources]);

  const filteredSources = useMemo(() => {
    const base = filterFmdSourcesCatalogue(
      ALL_FMD2_SOURCES,
      sourceSearch,
      categoryFilter,
      languageFilter,
      statusFilter,
      enabledSources
    );
    if (templateFilter === 'All') return base;
    return base.filter((s) => s.template === templateFilter);
  }, [
    sourceSearch,
    categoryFilter,
    templateFilter,
    languageFilter,
    statusFilter,
    enabledSources,
  ]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [sourceSearch, categoryFilter, templateFilter, languageFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredSources.length / PAGE_SIZE));
  const displayedSources = useMemo(() => {
    if (showAllRows || sourceSearch.trim().length > 0) {
      return filteredSources;
    }
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredSources.slice(start, start + PAGE_SIZE);
  }, [filteredSources, currentPage, showAllRows, sourceSearch]);

  const handleResetToDefaultFive = () => {
    onSetEnabledSources([...DEFAULT_ENABLED_SOURCE_IDS]);
  };

  const handleEnablePopularEnglish = () => {
    const popularEn = ALL_FMD2_SOURCES.filter(
      (s) => s.enabledByDefault || (s.language === 'EN' && s.avgResponseMs <= 145)
    )
      .slice(0, 25)
      .map((s) => s.id);
    onSetEnabledSources(Array.from(new Set([...DEFAULT_ENABLED_SOURCE_IDS, ...popularEn])));
  };

  const handleEnableAllFiltered = () => {
    const next = new Set(enabledSources);
    for (const s of filteredSources) {
      next.add(s.id);
    }
    onSetEnabledSources(Array.from(next));
  };

  const handleDisableFilteredOptional = () => {
    const filteredIds = new Set(filteredSources.map((s) => s.id));
    const next = enabledSources.filter(
      (id) => DEFAULT_ENABLED_SOURCE_IDS.includes(id) || !filteredIds.has(id)
    );
    onSetEnabledSources(next.length > 0 ? next : [...DEFAULT_ENABLED_SOURCE_IDS]);
  };

  return (
    <div className="space-y-8">
      {/* Top Header & Active Default Sources Summary */}
      <section className="bg-[#11121A] border border-white/[0.07] rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-display">
              FMD2 Source Catalogue ({ALL_FMD2_SOURCES.length} Connectors) &amp; Studio Settings
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 max-w-3xl">
              The 5 verified live sources (<span className="text-slate-200 font-medium">weebcentral.com</span>,{' '}
              <span className="text-slate-200 font-medium">asurascans.com</span>,{' '}
              <span className="text-slate-200 font-medium">mangadex.org</span>,{' '}
              <span className="text-slate-200 font-medium">likemanga.ink</span>, and{' '}
              <span className="text-slate-200 font-medium">mangakatana.com</span>) are enabled by default. All{' '}
              <span className="text-slate-200 font-mono">{ALL_FMD2_SOURCES.length - DEFAULT_ENABLED_SOURCE_IDS.length}</span>{' '}
              additional FMD2 repository Lua modules are disabled by default and can be toggled below.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleResetToDefaultFive}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-white/[0.1] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to 5 Default Sources</span>
            </button>
            <button
              type="button"
              onClick={onBackToCatalog}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Multi-Source Search</span>
            </button>
          </div>
        </div>

        {/* Active Sources Summary Strip */}
        <div className="pt-4 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-slate-300">
            <span className="font-mono text-violet-400 tabular-nums font-semibold">
              {enabledSources.length} / {ALL_FMD2_SOURCES.length} Sources Enabled:
            </span>
            <span className="text-slate-400">
              {enabledSources
                .slice(0, 8)
                .map((id) => ALL_FMD2_SOURCES.find((s) => s.id === id)?.name || id)
                .join(' · ')}
              {enabledSources.length > 8 ? ` · +${enabledSources.length - 8} more` : ''}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleEnablePopularEnglish}
              className="px-3 py-1.5 text-xs font-medium bg-[#090A0F] hover:bg-slate-900 text-slate-300 border border-white/[0.07] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Enable Top 25 English
            </button>
            <button
              type="button"
              onClick={handleEnableAllFiltered}
              className="px-3 py-1.5 text-xs font-medium bg-[#090A0F] hover:bg-slate-900 text-slate-300 border border-white/[0.07] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Enable Filtered ({filteredSources.length})
            </button>
            {enabledSources.length > DEFAULT_ENABLED_SOURCE_IDS.length && (
              <button
                type="button"
                onClick={handleDisableFilteredOptional}
                className="px-3 py-1.5 text-xs font-medium bg-[#090A0F] hover:bg-slate-900 text-rose-300 border border-white/[0.07] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Disable Optional ({enabledSources.length - DEFAULT_ENABLED_SOURCE_IDS.length})
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Studio Theme & Appearance Customizer */}
      {onUpdateThemePrefs && (
        <section
          aria-labelledby="studio-theme-heading"
          className="bg-[#11121A] border border-white/[0.07] rounded-xl p-6 space-y-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-violet-400 shrink-0" />
                <h2
                  id="studio-theme-heading"
                  className="text-lg font-bold text-white font-display"
                >
                  Studio Theme &amp; Apple Typography Customizer
                </h2>
              </div>
              <p className="text-xs text-slate-400 max-w-3xl">
                Personalize your workspace with {APP_THEME_PRESETS.length} manga-website inspired color themes, Apple font families (SF Pro, New York, SF Compact, SF Mono), and spring press animations.
              </p>
            </div>

            <button
              type="button"
              onClick={() => onUpdateThemePrefs(DEFAULT_UI_THEME_PREFS)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#090A0F] hover:bg-slate-900 text-slate-300 border border-white/[0.07] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Appearance</span>
            </button>
          </div>

          {/* Sleek Dropdown & Toggle Switch Grid for Studio Theme, Font, Accent, Motion & Surface */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2 border-t border-white/[0.06] text-xs">
            {/* 1. Studio Color Theme Dropdown */}
            <div className="p-4 bg-[#090A0F] border border-white/[0.07] rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-violet-400" />
                  <span>UI Color Theme</span>
                </span>
                <span className="text-[11px] font-mono text-violet-400">
                  {APP_THEME_PRESETS.find((t) => t.id === themePrefs.themeId)?.mode}
                </span>
              </div>
              <DropdownMenu<UiThemePreferences['themeId']>
                id="settings-studio-theme-select"
                ariaLabel="Select Studio UI Theme"
                value={themePrefs.themeId}
                options={APP_THEME_PRESETS.map((preset) => ({
                  value: preset.id,
                  label: `${preset.name} (${preset.inspiredBy})`,
                  description: preset.tagline,
                  badge: preset.mode,
                }))}
                onChange={(val) => onUpdateThemePrefs({ themeId: val })}
                menuWidthClass="w-80"
                triggerClassName="w-full"
                className="w-full"
              />
              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
                <span className="truncate">
                  {APP_THEME_PRESETS.find((t) => t.id === themePrefs.themeId)?.tagline}
                </span>
              </div>
            </div>

            {/* 2. Apple Font Family Dropdown */}
            <div className="p-4 bg-[#090A0F] border border-white/[0.07] rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5 text-violet-400" />
                  <span>Apple Font Family</span>
                </span>
                <span className="text-[11px] font-mono text-slate-400">Typography</span>
              </div>
              <DropdownMenu<NonNullable<UiThemePreferences['fontFamily']>>
                id="settings-apple-font-select"
                ariaLabel="Select Apple Font Family"
                value={themePrefs.fontFamily ?? 'sf-pro'}
                options={APPLE_FONT_PRESETS.map((font) => ({
                  value: font.id,
                  label: `${font.label} (${font.shortLabel})`,
                  description: font.description,
                }))}
                onChange={(val) => onUpdateThemePrefs({ fontFamily: val })}
                menuWidthClass="w-72"
                triggerClassName="w-full"
                className="w-full"
              />
              <div className="text-[11px] text-slate-400 truncate pt-0.5">
                {APPLE_FONT_PRESETS.find((f) => f.id === themePrefs.fontFamily)?.description}
              </div>
            </div>

            {/* 3. Primary Accent Color Dropdown */}
            <div className="p-4 bg-[#090A0F] border border-white/[0.07] rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <span
                    className="w-3 h-3 rounded-full border border-white/25 inline-block"
                    style={{
                      backgroundColor:
                        ACCENT_COLOR_PRESETS.find((a) => a.id === themePrefs.accentId)?.hex ||
                        '#6366f1',
                    }}
                  />
                  <span>Primary Accent Color</span>
                </span>
                <span className="font-mono text-[11px] text-slate-400">
                  {ACCENT_COLOR_PRESETS.find((a) => a.id === themePrefs.accentId)?.hex || 'Auto'}
                </span>
              </div>
              <DropdownMenu<UiThemePreferences['accentId']>
                id="settings-accent-color-select"
                ariaLabel="Select Primary Accent Color"
                value={themePrefs.accentId}
                options={ACCENT_COLOR_PRESETS.map((acc) => ({
                  value: acc.id,
                  label: acc.label,
                  badge: acc.hex || 'Auto',
                }))}
                onChange={(val) => onUpdateThemePrefs({ accentId: val })}
                menuWidthClass="w-64"
                triggerClassName="w-full"
                className="w-full"
              />
              <div className="text-[11px] text-slate-400 pt-0.5">
                Overrides active buttons, focus rings, and toggle switches.
              </div>
            </div>

            {/* 4. UI Animation & Motion Dropdown + 3D Card Hover Switch */}
            <div className="p-4 bg-[#090A0F] border border-white/[0.07] rounded-xl space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                  <span>Animation Curve</span>
                </span>
                <DropdownMenu<UiThemePreferences['animationStyle']>
                  id="settings-animation-style-select"
                  ariaLabel="Select UI Animation Style"
                  value={themePrefs.animationStyle}
                  options={UI_ANIMATION_PRESETS.map((anim) => ({
                    value: anim.id,
                    label: anim.label,
                    description: anim.description,
                  }))}
                  onChange={(val) => onUpdateThemePrefs({ animationStyle: val })}
                  align="right"
                  menuWidthClass="w-64"
                />
              </div>

              <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-3">
                <span className="text-slate-300 font-medium">
                  3D Card Hover Lift &amp; Cover Zoom
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={themePrefs.cardHoverEffects}
                  aria-label="Toggle 3D Card Hover Lift and Cover Zoom"
                  onClick={() =>
                    onUpdateThemePrefs({ cardHoverEffects: !themePrefs.cardHoverEffects })
                  }
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                    themePrefs.cardHoverEffects ? 'bg-violet-600' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      themePrefs.cardHoverEffects ? 'translate-x-4' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* 5. Surface Finish Dropdown + Ambient Studio Glow & Mouse Pointer Switches */}
            <div className="p-4 bg-[#090A0F] border border-white/[0.07] rounded-xl space-y-3 md:col-span-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-violet-400" />
                    <span>Surface Finish</span>
                  </span>
                  <DropdownMenu<UiThemePreferences['surfaceStyle']>
                    id="settings-surface-style-select"
                    ariaLabel="Select Surface Finish"
                    value={themePrefs.surfaceStyle}
                    options={SURFACE_STYLE_PRESETS.map((surf) => ({
                      value: surf.id,
                      label: surf.label,
                      description: surf.description,
                    }))}
                    onChange={(val) => onUpdateThemePrefs({ surfaceStyle: val })}
                    menuWidthClass="w-60"
                  />
                </div>

                <div className="flex items-center justify-between gap-3 sm:pl-4 sm:border-l sm:border-white/[0.06]">
                  <span className="text-slate-300 font-medium flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                    <span>Ambient Studio Glow</span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={themePrefs.ambientGlow}
                    aria-label="Toggle Ambient Studio Glow"
                    onClick={() =>
                      onUpdateThemePrefs({ ambientGlow: !themePrefs.ambientGlow })
                    }
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                      themePrefs.ambientGlow ? 'bg-violet-600' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        themePrefs.ambientGlow ? 'translate-x-4' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3 sm:pl-4 sm:border-l sm:border-white/[0.06]">
                  <span className="text-slate-300 font-medium flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                    <span>Pointer &amp; Click Animations</span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={themePrefs.cursorAnimation !== false}
                    aria-label="Toggle Pointer and Click Animations"
                    onClick={() =>
                      onUpdateThemePrefs({
                        cursorAnimation: themePrefs.cursorAnimation === false,
                      })
                    }
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                      themePrefs.cursorAnimation !== false ? 'bg-violet-600' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        themePrefs.cursorAnimation !== false ? 'translate-x-4' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Search & Filter Controls for ~600 FMD2 Source Catalogue */}
      <section className="bg-[#11121A] border border-white/[0.07] rounded-xl p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
          <div className="sm:col-span-2 lg:col-span-4 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              aria-label="Search FMD2 sources catalogue by website name, domain, or Lua module"
              value={sourceSearch}
              onChange={(e) => setSourceSearch(e.target.value)}
              placeholder={`Search all ${ALL_FMD2_SOURCES.length} FMD2 Lua sources by name, domain, or script...`}
              className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm bg-[#090A0F] border border-white/[0.07] rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
            />
          </div>

          {/* Status Dropdown */}
          <div className="lg:col-span-2">
            <DropdownMenu<'all' | 'enabled' | 'disabled'>
              id="source-status-select"
              label="State"
              ariaLabel="Filter sources by enabled state"
              value={statusFilter}
              options={[
                {
                  value: 'all',
                  label: `All (${ALL_FMD2_SOURCES.length})`,
                },
                {
                  value: 'enabled',
                  label: `Enabled (${enabledSources.length})`,
                  accentDotColor: 'bg-emerald-400',
                },
                {
                  value: 'disabled',
                  label: `Disabled (${ALL_FMD2_SOURCES.length - enabledSources.length})`,
                  accentDotColor: 'bg-slate-600',
                },
              ]}
              onChange={(val) => setStatusFilter(val)}
              menuWidthClass="w-56"
              triggerClassName="w-full"
              className="w-full"
            />
          </div>

          {/* Category Dropdown */}
          <div className="lg:col-span-2">
            <DropdownMenu<string>
              id="source-category-select"
              label="Type"
              ariaLabel="Filter sources by category"
              value={categoryFilter}
              options={CATEGORIES.map((cat) => ({
                value: cat,
                label: cat === 'All' ? 'All Categories' : cat,
              }))}
              onChange={(val) => setCategoryFilter(val)}
              menuWidthClass="w-60"
              triggerClassName="w-full"
              className="w-full"
            />
          </div>

          {/* Template Dropdown */}
          <div className="lg:col-span-2">
            <DropdownMenu<string>
              id="source-template-select"
              label="Script"
              ariaLabel="Filter sources by script template"
              value={templateFilter}
              options={TEMPLATES.map((tpl) => ({
                value: tpl,
                label: tpl === 'All' ? 'All Templates' : tpl,
              }))}
              onChange={(val) => setTemplateFilter(val)}
              menuWidthClass="w-52"
              triggerClassName="w-full"
              className="w-full"
            />
          </div>

          {/* Language Dropdown */}
          <div className="lg:col-span-2">
            <DropdownMenu<string>
              id="source-lang-select"
              label="Lang"
              ariaLabel="Filter sources by language"
              value={languageFilter}
              options={LANGUAGES.map((lang) => ({
                value: lang,
                label: lang === 'All' ? 'All Languages' : lang,
              }))}
              onChange={(val) => setLanguageFilter(val)}
              align="right"
              menuWidthClass="w-48"
              triggerClassName="w-full"
              className="w-full"
            />
          </div>
        </div>

        {/* High-Density FMD2 Lua Modules Table */}
        <div className="border border-white/[0.07] rounded-xl overflow-hidden bg-[#090A0F]">
          <div className="px-4 py-3 border-b border-white/[0.07] flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 bg-slate-900/40">
            <span className="font-mono tabular-nums">
              Showing {displayedSources.length} of {filteredSources.length} matching FMD2 Lua Modules ({ALL_FMD2_SOURCES.length} total in repository)
            </span>

            {filteredSources.length > PAGE_SIZE && !sourceSearch.trim() && (
              <div className="flex items-center gap-2 font-mono">
                <button
                  type="button"
                  onClick={() => setShowAllRows((v) => !v)}
                  className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-white/[0.1] cursor-pointer"
                >
                  {showAllRows ? `Paginate (${PAGE_SIZE}/page)` : `Show All ${filteredSources.length}`}
                </button>
                {!showAllRows && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 cursor-pointer"
                      aria-label="Previous page of sources"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="px-2 text-[11px] text-slate-300 tabular-nums">
                      Page {currentPage} / {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 cursor-pointer"
                      aria-label="Next page of sources"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {filteredSources.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="text-sm font-semibold text-white">
                No FMD2 sources match &ldquo;{sourceSearch}&rdquo;
              </div>
              <button
                type="button"
                onClick={() => {
                  setSourceSearch('');
                  setCategoryFilter('All');
                  setTemplateFilter('All');
                  setLanguageFilter('All');
                  setStatusFilter('all');
                }}
                className="px-4 py-2 text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white rounded-lg"
              >
                Reset Catalogue Filters
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-[#090A0F] border-b border-white/[0.07] text-[11px] font-mono text-slate-400">
                  <tr>
                    <th className="py-3 px-4 w-14">STATE</th>
                    <th className="py-3 px-4">SOURCE WEBSITE &amp; DOMAIN</th>
                    <th className="py-3 px-4 hidden md:table-cell">FMD2 LUA MODULE</th>
                    <th className="py-3 px-4 hidden sm:table-cell">CATEGORY &amp; TEMPLATE</th>
                    <th className="py-3 px-4 hidden lg:table-cell text-right">LANG · PING</th>
                    <th className="py-3 px-4 text-right">ENABLED</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-xs">
                  {displayedSources.map((src) => {
                    const isEnabled = enabledSet.has(src.id);
                    const isDefaultFive = DEFAULT_ENABLED_SOURCE_IDS.includes(src.id);
                    return (
                      <tr
                        key={src.id}
                        className={`transition-colors ${
                          isEnabled
                            ? 'bg-violet-950/15 hover:bg-violet-950/25'
                            : 'hover:bg-slate-900/50'
                        }`}
                      >
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            disabled={!isDefaultFive}
                            onClick={() => onToggleSource(src.id)}
                            aria-label={
                              isDefaultFive
                                ? `${isEnabled ? 'Disable' : 'Enable'} ${src.name}`
                                : `${src.name} has no live scraper yet`
                            }
                            title={isDefaultFive ? undefined : 'Connector metadata only; no live scraper is implemented yet'}
                            className="text-slate-400 hover:text-violet-400 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          >
                            {isEnabled ? (
                              <CheckSquare className="w-4 h-4 text-violet-400" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-600" />
                            )}
                          </button>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white flex items-center gap-2">
                            <span>{src.name}</span>
                            {isDefaultFive && (
                              <span className="text-[11px] font-mono text-violet-400 font-normal">
                                · Live Adapter
                              </span>
                            )}
                            {!isDefaultFive && (
                              <span className="text-[10px] font-mono text-slate-500 font-normal">
                                · Descriptor Only
                              </span>
                            )}
                          </div>
                          <div className="text-slate-400 font-mono text-[11px]">
                            {src.domain}
                          </div>
                        </td>
                        <td className="py-3 px-4 hidden md:table-cell font-mono text-[11px] text-slate-300">
                          {src.luaModule}
                        </td>
                        <td className="py-3 px-4 hidden sm:table-cell text-slate-400">
                          <span>{src.category}</span>
                          <span aria-hidden="true"> · </span>
                          <span className="font-mono text-slate-500">{src.template}</span>
                        </td>
                        <td className="py-3 px-4 hidden lg:table-cell text-right font-mono tabular-nums text-slate-400">
                          <span>{src.language}</span>
                          <span aria-hidden="true"> · </span>
                          <span>{src.avgResponseMs}ms</span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={isEnabled}
                            aria-disabled={!isDefaultFive}
                            disabled={!isDefaultFive}
                            onClick={() => onToggleSource(src.id)}
                            aria-label={
                              isDefaultFive
                                ? `${isEnabled ? 'Disable' : 'Enable'} ${src.name} source`
                                : `${src.name} has no live scraper yet`
                            }
                            title={isDefaultFive ? undefined : 'Connector metadata only; no live scraper is implemented yet'}
                            className="inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <span className="text-[11px] font-mono text-slate-400">
                              {isEnabled ? 'ON' : 'OFF'}
                            </span>
                            <span
                              aria-hidden="true"
                              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                                isEnabled ? 'bg-violet-600' : 'bg-slate-700'
                              }`}
                            >
                              <span
                                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                  isEnabled ? 'translate-x-4' : 'translate-x-1'
                                }`}
                              />
                            </span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Automatic Reader Mode Detection (Genre & Metadata Tags) */}
      <section
        aria-labelledby="auto-reader-mode-heading"
        className="bg-[#11121A] border border-white/[0.07] rounded-xl p-6 space-y-5"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-violet-400 shrink-0" />
              <h2
                id="auto-reader-mode-heading"
                className="text-lg font-bold text-white font-display"
              >
                Automatic Reader Mode Detection (Genre &amp; Metadata Tags)
              </h2>
            </div>
            <p className="text-xs text-slate-400 max-w-3xl">
              Automatically toggle between <span className="text-slate-200 font-medium">Page-by-Page (Manga)</span> for traditional Japanese manga and <span className="text-slate-200 font-medium">Continuous Vertical Scroll (Webtoon)</span> for long-strip webtoons/manhwa/manhua based on each series&apos; genre or metadata tags.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
            <button
              type="button"
              role="switch"
              aria-checked={autoDetectReadingMode}
              aria-label="Automatically toggle reader mode based on series genre or metadata tags"
              onClick={handleToggleAutoDetectMode}
              className={`flex items-center gap-2.5 px-4 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                autoDetectReadingMode
                  ? 'bg-violet-600/20 border-violet-500/70 text-violet-200 hover:bg-violet-600/30'
                  : 'bg-[#090A0F] border-white/[0.07] text-slate-400 hover:text-slate-200'
              }`}
            >
              <span
                className={`w-8 h-4 rounded-full relative transition-colors inline-flex items-center p-0.5 ${
                  autoDetectReadingMode ? 'bg-violet-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`w-3 h-3 rounded-full bg-white transition-transform ${
                    autoDetectReadingMode ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </span>
              <span>
                Auto-Toggle by Genre/Tags: {autoDetectReadingMode ? 'ON' : 'OFF'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleResetTriggerTags}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#090A0F] hover:bg-slate-900 text-slate-300 border border-white/[0.07] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Tag Rules</span>
            </button>
          </div>
        </div>

        {/* Rule Mapping & Fallback Mode Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-2">
          <div className="p-4 bg-[#090A0F] border border-white/[0.07] rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-violet-400" />
                <span>Traditional Manga Rule</span>
              </span>
              <span className="text-[11px] font-mono text-violet-400">
                → Page-by-Page (RTL)
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Series tagged with <span className="text-slate-300 font-mono">Seinen · Shounen · Shoujo · Josei · Traditional Manga · Tankobon</span> (and without Webtoon trigger tags) open in single-page reader mode with RTL tap zones.
            </p>
          </div>

          <div className="p-4 bg-[#090A0F] border border-white/[0.07] rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                <ScrollText className="w-3.5 h-3.5 text-emerald-400" />
                <span>Webtoon / Manhwa Rule</span>
              </span>
              <span className="text-[11px] font-mono text-emerald-400">
                → Continuous Scroll (LTR)
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Series matching any active <span className="text-slate-300 font-mono">Webtoon Trigger Tag</span> below automatically open in continuous vertical scroll mode with seamless 0px page stitching.
            </p>
          </div>

          <div className="p-4 bg-[#090A0F] border border-white/[0.07] rounded-lg space-y-2">
            <span className="block text-xs font-semibold text-white">
              Fallback Reader Mode (When Auto-Toggle is OFF)
            </span>
            <DropdownMenu<ReadingMode>
              id="settings-fallback-reading-mode"
              ariaLabel="Fallback Reader Mode (When Auto-Toggle is OFF)"
              value={defaultReadingMode}
              options={READING_MODES_META.map((m) => ({
                value: m.id,
                label: m.label,
                description: m.description,
              }))}
              onChange={(val) => onUpdateEngineConfig({ defaultReadingMode: val })}
              menuWidthClass="w-72"
              triggerClassName="w-full"
              className="w-full"
            />
            <div className="text-[11px] text-slate-500 font-mono">
              {autoDetectReadingMode
                ? 'Active: Genre & Metadata Auto-Detection overrides fallback'
                : `Active: All series locked to ${
                    READING_MODES_META.find((m) => m.id === defaultReadingMode)?.shortLabel
                  }`}
            </div>
          </div>
        </div>

        {/* Interactive Genre & Metadata Trigger Tags Configuration */}
        <div className="p-4 bg-[#090A0F] border border-white/[0.07] rounded-lg space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-white">
                Continuous Vertical Scroll (Webtoon) Trigger Genres &amp; Metadata Tags ({webtoonTriggerTags.length} active)
              </div>
              <div className="text-[11px] text-slate-400">
                Click any genre or metadata tag below to toggle whether matching series automatically switch to Continuous Vertical Scroll:
              </div>
            </div>

            <form
              onSubmit={handleAddCustomTriggerTag}
              className="flex items-center gap-2 w-full sm:w-auto"
            >
              <label htmlFor="custom-trigger-tag-input" className="sr-only">
                Add custom genre or metadata trigger tag
              </label>
              <input
                id="custom-trigger-tag-input"
                type="text"
                value={customTagInput}
                onChange={(e) => setCustomTagInput(e.target.value)}
                placeholder="Add genre/tag (e.g. Cyberpunk)..."
                className="px-3 py-1.5 text-xs font-mono bg-[#11121A] border border-white/[0.07] rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500 flex-1 sm:w-48 min-w-0"
              />
              <button
                type="submit"
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Tag</span>
              </button>
            </form>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {Array.from(
              new Set([
                ...DEFAULT_WEBTOON_TRIGGER_TAGS,
                ...webtoonTriggerTags,
                'Martial Arts',
                'Cyberpunk',
                'Dark Fantasy',
                'Supernatural',
                'Sci-Fi',
              ])
            ).map((tag) => {
              const isSelected = webtoonTriggerTags.some(
                (t) => t.trim().toLowerCase() === tag.trim().toLowerCase()
              );
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleToggleWebtoonTriggerTag(tag)}
                  aria-pressed={isSelected}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300 hover:bg-emerald-950/60'
                      : 'bg-[#11121A] border-white/[0.07] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>{tag}</span>
                  {isSelected && <X className="w-3 h-3 text-emerald-400" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Live Series Genre & Metadata Auto-Detection Preview */}
        {previewSeriesList.length > 0 && (
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">
                Live Genre &amp; Metadata Classification Preview
              </span>
              <span className="font-mono text-[11px] text-slate-400">
                Click &ldquo;Test in Reader&rdquo; to verify automatic mode switching live
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {previewSeriesList.map((item) => {
                const res = resolveSeriesReadingMode(item, engineConfig);
                const firstChap =
                  item.chapters[item.chapters.length - 1] || item.chapters[0];
                return (
                  <div
                    key={item.id}
                    className="p-3 bg-[#090A0F] border border-white/[0.07] rounded-lg flex flex-col justify-between gap-2.5"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white truncate">
                          {item.title}
                        </span>
                        <span
                          className={`text-[11px] font-mono whitespace-nowrap shrink-0 ${
                            res.mode === 'webtoon' ? 'text-emerald-400' : 'text-violet-400'
                          }`}
                        >
                          {res.mode === 'webtoon'
                            ? '→ Webtoon Scroll'
                            : res.mode === 'single'
                            ? '→ Single-Page'
                            : `→ ${res.mode}`}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono truncate">
                        Tags: {item.demographic} · {item.genres.join(' · ')}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono truncate">
                        {res.isAutoDetected
                          ? `Matched: ${res.matchedTags.slice(0, 3).join(', ')}`
                          : 'Manual fallback active'}
                      </div>
                    </div>

                    {onOpenSeriesInReader && firstChap && (
                      <button
                        type="button"
                        onClick={() => onOpenSeriesInReader(item, firstChap)}
                        className="w-full py-1.5 px-2.5 text-xs font-medium bg-slate-800/80 hover:bg-violet-600 text-slate-200 hover:text-white rounded-md transition-colors text-center whitespace-nowrap"
                      >
                        Test {item.title} in Reader
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Downloader Engine Global Preferences */}
      <section className="bg-[#11121A] border border-white/[0.07] rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <SlidersHorizontal className="w-4 h-4 text-violet-400" />
          <h2 className="text-base font-bold text-white font-display">
            FMD2 Downloader Engine &amp; Archive Defaults
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 text-xs">
          <div className="p-4 bg-[#090A0F] border border-white/[0.07] rounded-lg space-y-2">
            <span className="block text-slate-400">
              Default Container Format
            </span>
            <DropdownMenu<ArchiveFormat>
              id="settings-default-format"
              ariaLabel="Default Container Format"
              value={engineConfig.defaultFormat}
              options={(['CBZ', 'ZIP'] as ArchiveFormat[]).map((fmt) => ({
                value: fmt,
                label: `${fmt} Archive`,
              }))}
              onChange={(val) => onUpdateEngineConfig({ defaultFormat: val })}
              menuWidthClass="w-52"
              triggerClassName="w-full"
              className="w-full"
            />
          </div>

          <div className="p-4 bg-[#090A0F] border border-white/[0.07] rounded-lg space-y-2">
            <span className="block text-slate-400">
              Concurrent Chapter Workers
            </span>
            <DropdownMenu<string>
              id="settings-concurrent-tasks"
              ariaLabel="Concurrent Chapter Workers"
              value={String(engineConfig.maxConcurrentTasks)}
              options={[1, 2, 3, 4, 6].map((n) => ({
                value: String(n),
                label: `${n} Parallel Chapters`,
              }))}
              onChange={(val) => onUpdateEngineConfig({ maxConcurrentTasks: Number(val) })}
              menuWidthClass="w-52"
              triggerClassName="w-full"
              className="w-full"
            />
          </div>

          <div className="p-4 bg-[#090A0F] border border-white/[0.07] rounded-lg space-y-2">
            <span className="block text-slate-400">
              Image Fetch Threads per Chapter
            </span>
            <DropdownMenu<string>
              id="settings-threads-per-task"
              ariaLabel="Image Fetch Threads per Chapter"
              value={String(engineConfig.maxThreadsPerTask)}
              options={[1, 2, 4, 8].map((n) => ({
                value: String(n),
                label: `${n} Threads / Chapter`,
              }))}
              onChange={(val) => onUpdateEngineConfig({ maxThreadsPerTask: Number(val) })}
              align="right"
              menuWidthClass="w-52"
              triggerClassName="w-full"
              className="w-full"
            />
          </div>
        </div>
      </section>
    </div>
  );
};
