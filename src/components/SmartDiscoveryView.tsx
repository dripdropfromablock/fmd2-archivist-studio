import React, { useState } from 'react';
import { Sparkles, Search, BookOpen, ArrowRight } from 'lucide-react';
import type { MangaSeries } from '../utils/fmdLogic.ts';

interface RecommendationItem {
  title: string;
  author: string;
  recommendedSource: string;
  readingFormat: string;
  rationale: string;
}

interface DiscoveryResult {
  model: string;
  thinkingLevel: string;
  synthesis: string;
  recommendations: RecommendationItem[];
}

interface SmartDiscoveryViewProps {
  catalog: MangaSeries[];
  onInspectSeries: (series: MangaSeries) => void;
  onSearchCatalogForTitle: (title: string) => void;
}

export const SmartDiscoveryView: React.FC<SmartDiscoveryViewProps> = ({
  catalog,
  onInspectSeries,
  onSearchCatalogForTitle,
}) => {
  const [query, setQuery] = useState(
    'Compare dark progression manhwa like Solo Leveling with dark fantasy seinen like Berserk, and recommend the best FMD2 source connectors and reading modes.'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiscoveryResult | null>(null);

  const handleRunQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/ai/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      if (!response.ok) {
        throw new Error('Failed to run high-thinking analysis.');
      }
      const data = (await response.json()) as DiscoveryResult;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach discovery service.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="bg-[#11121A] border border-white/[0.07] rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-white font-display">
              Deep Manga Archivist & Reading Order Engine
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Powered by server-side Gemini 4 Argon with High Thinking mode for complex reading order, scanlation source selection, and thematic cross-referencing.
            </p>
          </div>
          <div className="text-xs font-mono text-violet-300">
            Model: gemini-4-argon · ThinkingLevel.HIGH
          </div>
        </div>

        <form onSubmit={handleRunQuery} className="space-y-3">
          <label htmlFor="deep-discovery-input" className="sr-only">
            Ask a complex manga reading order or recommendation question
          </label>
          <textarea
            id="deep-discovery-input"
            rows={3}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask about complex reading orders, best scanlation sources, or thematic similarities..."
            className="w-full p-3.5 text-sm bg-[#090A0F] border border-white/[0.07] rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>Prompts:</span>
              <button
                type="button"
                onClick={() =>
                  setQuery(
                    'What is the ideal reading order and best FMD2 Lua source for Tsutomu Nihei megastructure sci-fi manga like BLAME!?'
                  )
                }
                className="text-violet-400 hover:underline whitespace-nowrap shrink-0"
              >
                BLAME! megastructure guide
              </button>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() =>
                  setQuery(
                    'Recommend completed dungeon & necromancer manhwa similar to Solo Leveling with the cleanest scanlation sources.'
                  )
                }
                className="text-violet-400 hover:underline whitespace-nowrap shrink-0"
              >
                Solo Leveling progression picks
              </button>
            </div>

            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-4 h-4" />
              <span>{loading ? 'Reasoning (ThinkingLevel.HIGH)...' : 'Analyze with High Thinking'}</span>
            </button>
          </div>
        </form>

        {error && (
          <div className="text-xs font-mono text-rose-400 bg-rose-950/40 border border-rose-800/60 rounded-lg p-3">
            {error}
          </div>
        )}
      </section>

      {result && (
        <section className="space-y-6">
          <div className="bg-[#11121A] border border-white/[0.07] rounded-xl p-6 space-y-3">
            <div className="text-xs font-mono text-slate-400">
              ARCHIVIST SYNTHESIS · {result.model.toUpperCase()} · THINKING: {result.thinkingLevel}
            </div>
            <p className="text-sm text-slate-200 leading-relaxed max-w-4xl">
              {result.synthesis}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {result.recommendations.map((rec, idx) => {
              const matchedInCatalog = catalog.find(
                (m) => m.title.toLowerCase() === rec.title.toLowerCase()
              );
              return (
                <div
                  key={`${rec.title}-${idx}`}
                  className="bg-[#11121A] border border-white/[0.07] rounded-xl p-5 flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="text-xs font-mono text-violet-400">
                      0{idx + 1}. {rec.recommendedSource}
                    </div>
                    <h3 className="text-lg font-bold text-white font-display">
                      {rec.title}
                    </h3>
                    <div className="text-xs text-slate-400">
                      <span>{rec.author}</span>
                      <span aria-hidden="true"> · </span>
                      <span>{rec.readingFormat}</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed pt-1">
                      {rec.rationale}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between gap-2">
                    {matchedInCatalog ? (
                      <button
                        type="button"
                        onClick={() => onInspectSeries(matchedInCatalog)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-violet-400 hover:text-violet-300 whitespace-nowrap shrink-0"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Inspect & Read Chapters</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSearchCatalogForTitle(rec.title)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white whitespace-nowrap shrink-0"
                      >
                        <Search className="w-3.5 h-3.5" />
                        <span>Query Across Sources</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
