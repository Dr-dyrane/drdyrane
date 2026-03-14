/**
 * Diagnostic Search Analytics
 * 
 * Tracks search patterns, popular diagnoses, and usage metrics
 * for the intentional ICD-10 diagnostic search feature.
 */

export interface SearchAnalyticsEntry {
  diagnosis: string;
  icd10?: string;
  category?: string;
  timestamp: number;
  source: 'search' | 'quick_pick' | 'recent' | 'filter';
}

export interface SearchAnalytics {
  total_searches: number;
  unique_diagnoses: number;
  searches: SearchAnalyticsEntry[];
  top_diagnoses: Array<{
    diagnosis: string;
    icd10?: string;
    category?: string;
    count: number;
  }>;
  category_distribution: Record<string, number>;
  last_updated: number;
}

const STORAGE_KEY = 'diagnostic_search_analytics';
const MAX_HISTORY = 1000; // Keep last 1000 searches

/**
 * Load analytics from localStorage
 */
export const loadSearchAnalytics = (): SearchAnalytics => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return createEmptyAnalytics();
    }
    return JSON.parse(stored);
  } catch (error) {
    console.error('[SearchAnalytics] Failed to load analytics:', error);
    return createEmptyAnalytics();
  }
};

/**
 * Save analytics to localStorage
 */
export const saveSearchAnalytics = (analytics: SearchAnalytics): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(analytics));
  } catch (error) {
    console.error('[SearchAnalytics] Failed to save analytics:', error);
  }
};

/**
 * Create empty analytics object
 */
const createEmptyAnalytics = (): SearchAnalytics => ({
  total_searches: 0,
  unique_diagnoses: 0,
  searches: [],
  top_diagnoses: [],
  category_distribution: {},
  last_updated: Date.now(),
});

/**
 * Track a new search
 */
export const trackSearch = (
  diagnosis: string,
  icd10?: string,
  category?: string,
  source: SearchAnalyticsEntry['source'] = 'search'
): void => {
  const analytics = loadSearchAnalytics();

  // Add new search entry
  const entry: SearchAnalyticsEntry = {
    diagnosis,
    icd10,
    category,
    timestamp: Date.now(),
    source,
  };

  analytics.searches.unshift(entry);

  // Keep only last MAX_HISTORY searches
  if (analytics.searches.length > MAX_HISTORY) {
    analytics.searches = analytics.searches.slice(0, MAX_HISTORY);
  }

  // Recalculate metrics
  analytics.total_searches = analytics.searches.length;
  analytics.unique_diagnoses = new Set(analytics.searches.map((s) => s.diagnosis)).size;
  analytics.last_updated = Date.now();

  // Calculate top diagnoses
  const diagnosisCounts = new Map<string, { count: number; icd10?: string; category?: string }>();
  analytics.searches.forEach((search) => {
    const existing = diagnosisCounts.get(search.diagnosis);
    if (existing) {
      existing.count++;
    } else {
      diagnosisCounts.set(search.diagnosis, {
        count: 1,
        icd10: search.icd10,
        category: search.category,
      });
    }
  });

  analytics.top_diagnoses = Array.from(diagnosisCounts.entries())
    .map(([diagnosis, data]) => ({
      diagnosis,
      icd10: data.icd10,
      category: data.category,
      count: data.count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20); // Top 20

  // Calculate category distribution
  const categoryDist: Record<string, number> = {};
  analytics.searches.forEach((search) => {
    if (search.category) {
      categoryDist[search.category] = (categoryDist[search.category] || 0) + 1;
    }
  });
  analytics.category_distribution = categoryDist;

  saveSearchAnalytics(analytics);
};

/**
 * Clear all analytics
 */
export const clearSearchAnalytics = (): void => {
  saveSearchAnalytics(createEmptyAnalytics());
};

/**
 * Get analytics summary
 */
export const getAnalyticsSummary = (): {
  total: number;
  unique: number;
  topDiagnosis: string | null;
  topCategory: string | null;
} => {
  const analytics = loadSearchAnalytics();
  const topDiagnosis = analytics.top_diagnoses[0]?.diagnosis || null;
  const topCategory =
    Object.entries(analytics.category_distribution).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  return {
    total: analytics.total_searches,
    unique: analytics.unique_diagnoses,
    topDiagnosis,
    topCategory,
  };
};

