import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Search, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  loadSearchAnalytics,
  clearSearchAnalytics,
  type SearchAnalytics,
} from './diagnosticSearchAnalytics';

interface DiagnosticSearchAnalyticsDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DiagnosticSearchAnalyticsDashboard: React.FC<
  DiagnosticSearchAnalyticsDashboardProps
> = ({ isOpen, onClose }) => {
  const [analytics, setAnalytics] = useState<SearchAnalytics | null>(null);

  useEffect(() => {
    if (isOpen) {
      setAnalytics(loadSearchAnalytics());
    }
  }, [isOpen]);

  const handleClear = () => {
    if (confirm('Clear all search analytics? This cannot be undone.')) {
      clearSearchAnalytics();
      setAnalytics(loadSearchAnalytics());
    }
  };

  if (!analytics) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[300]"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-2xl md:max-h-[80vh] surface-raised rounded-[24px] p-6 z-[310] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-accent-soft rounded-xl">
                  <BarChart3 size={20} className="text-accent-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-content-primary">Search Analytics</h2>
                  <p className="text-xs text-content-dim">
                    Last updated: {new Date(analytics.last_updated).toLocaleString()}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                <X size={18} className="text-content-dim" />
              </button>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="surface-strong rounded-2xl p-4">
                <p className="text-xs text-content-dim uppercase tracking-wide mb-1">Total Searches</p>
                <p className="text-2xl font-bold text-content-primary">{analytics.total_searches}</p>
              </div>
              <div className="surface-strong rounded-2xl p-4">
                <p className="text-xs text-content-dim uppercase tracking-wide mb-1">Unique Diagnoses</p>
                <p className="text-2xl font-bold text-content-primary">{analytics.unique_diagnoses}</p>
              </div>
            </div>

            {/* Top Diagnoses */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={16} className="text-accent-primary" />
                <h3 className="text-sm font-semibold text-content-primary">Top Diagnoses</h3>
              </div>
              <div className="space-y-2">
                {analytics.top_diagnoses.slice(0, 10).map((item, index) => (
                  <div
                    key={`top-${index}`}
                    className="surface-strong rounded-xl px-3 py-2.5 flex items-center justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-content-primary truncate">{item.diagnosis}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {item.icd10 && (
                          <span className="text-[11px] font-mono text-accent-primary">{item.icd10}</span>
                        )}
                        {item.category && (
                          <span className="text-[11px] text-content-dim">• {item.category}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-semibold text-content-secondary">{item.count}×</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Category Distribution */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Search size={16} className="text-accent-primary" />
                <h3 className="text-sm font-semibold text-content-primary">Category Distribution</h3>
              </div>
              <div className="space-y-2">
                {Object.entries(analytics.category_distribution)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 8)
                  .map(([category, count]) => {
                    const percentage = ((count / analytics.total_searches) * 100).toFixed(1);
                    return (
                      <div key={category} className="surface-strong rounded-xl px-3 py-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-content-primary">{category}</span>
                          <span className="text-xs text-content-secondary">
                            {count} ({percentage}%)
                          </span>
                        </div>
                        <div className="h-1.5 bg-surface-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-accent-primary rounded-full"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Actions */}
            <button
              onClick={handleClear}
              className="w-full h-11 rounded-2xl bg-danger-primary/10 text-danger-primary font-medium text-sm hover:bg-danger-primary/20 transition-colors"
            >
              Clear All Analytics
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

