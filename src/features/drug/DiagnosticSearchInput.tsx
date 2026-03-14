import React, { useState, useEffect, useRef } from 'react';
import { Search, X, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

interface DiagnosticSuggestion {
  label: string;
  icd10?: string;
  category?: string;
}

interface DiagnosticSearchInputProps {
  value: string;
  onChange: (value: string, icd10?: string) => void;
  onSelect?: (diagnosis: string, icd10?: string) => void;
  placeholder?: string;
  recentSearches?: DiagnosticSuggestion[];
  quickPicks?: DiagnosticSuggestion[];
  forceClose?: boolean;
}

const COMMON_DIAGNOSES: DiagnosticSuggestion[] = [
  // Infectious Diseases
  { label: 'Uncomplicated Malaria', icd10: 'B54', category: 'Infectious' },
  { label: 'Typhoid Fever', icd10: 'A01.0', category: 'Infectious' },
  { label: 'Dengue Fever', icd10: 'A90', category: 'Infectious' },
  { label: 'Tuberculosis', icd10: 'A15.9', category: 'Infectious' },
  { label: 'HIV Disease', icd10: 'B20', category: 'Infectious' },
  { label: 'Pneumonia', icd10: 'J18.9', category: 'Infectious' },
  { label: 'Acute Upper Respiratory Infection', icd10: 'J06.9', category: 'Respiratory' },
  { label: 'Urinary Tract Infection', icd10: 'N39.0', category: 'Genitourinary' },
  { label: 'Cellulitis', icd10: 'L03.90', category: 'Infectious' },
  { label: 'Sepsis', icd10: 'A41.9', category: 'Infectious' },

  // Gastrointestinal
  { label: 'Peptic Ulcer Disease', icd10: 'K27.9', category: 'Gastrointestinal' },
  { label: 'Acute Gastroenteritis', icd10: 'K52.9', category: 'Gastrointestinal' },
  { label: 'Gastroesophageal Reflux Disease', icd10: 'K21.9', category: 'Gastrointestinal' },
  { label: 'Irritable Bowel Syndrome', icd10: 'K58.9', category: 'Gastrointestinal' },
  { label: 'Acute Appendicitis', icd10: 'K35.80', category: 'Gastrointestinal' },
  { label: 'Chronic Liver Disease', icd10: 'K76.9', category: 'Gastrointestinal' },

  // Cardiovascular
  { label: 'Hypertension', icd10: 'I10', category: 'Cardiovascular' },
  { label: 'Heart Failure', icd10: 'I50.9', category: 'Cardiovascular' },
  { label: 'Atrial Fibrillation', icd10: 'I48.91', category: 'Cardiovascular' },
  { label: 'Acute Myocardial Infarction', icd10: 'I21.9', category: 'Cardiovascular' },
  { label: 'Angina Pectoris', icd10: 'I20.9', category: 'Cardiovascular' },

  // Endocrine
  { label: 'Type 2 Diabetes Mellitus', icd10: 'E11.9', category: 'Endocrine' },
  { label: 'Type 1 Diabetes Mellitus', icd10: 'E10.9', category: 'Endocrine' },
  { label: 'Hypothyroidism', icd10: 'E03.9', category: 'Endocrine' },
  { label: 'Hyperthyroidism', icd10: 'E05.90', category: 'Endocrine' },
  { label: 'Obesity', icd10: 'E66.9', category: 'Endocrine' },

  // Respiratory
  { label: 'Asthma', icd10: 'J45.909', category: 'Respiratory' },
  { label: 'Chronic Obstructive Pulmonary Disease', icd10: 'J44.9', category: 'Respiratory' },
  { label: 'Acute Bronchitis', icd10: 'J20.9', category: 'Respiratory' },
  { label: 'Pulmonary Tuberculosis', icd10: 'A15.0', category: 'Respiratory' },

  // Neurological
  { label: 'Migraine', icd10: 'G43.9', category: 'Neurological' },
  { label: 'Acute Ischemic Stroke', icd10: 'I63.9', category: 'Neurological' },
  { label: 'Epilepsy', icd10: 'G40.909', category: 'Neurological' },
  { label: 'Tension-Type Headache', icd10: 'G44.209', category: 'Neurological' },
  { label: 'Peripheral Neuropathy', icd10: 'G62.9', category: 'Neurological' },
  { label: 'Meningitis', icd10: 'G03.9', category: 'Neurological' },

  // Dermatological
  { label: 'Lichen Simplex Chronicus', icd10: 'L28.0', category: 'Dermatological' },
  { label: 'Atopic Dermatitis', icd10: 'L20.9', category: 'Dermatological' },
  { label: 'Psoriasis', icd10: 'L40.9', category: 'Dermatological' },
  { label: 'Fungal Skin Infection', icd10: 'B36.9', category: 'Dermatological' },
  { label: 'Acne Vulgaris', icd10: 'L70.0', category: 'Dermatological' },

  // Musculoskeletal
  { label: 'Osteoarthritis', icd10: 'M19.90', category: 'Musculoskeletal' },
  { label: 'Rheumatoid Arthritis', icd10: 'M06.9', category: 'Musculoskeletal' },
  { label: 'Low Back Pain', icd10: 'M54.5', category: 'Musculoskeletal' },
  { label: 'Gout', icd10: 'M10.9', category: 'Musculoskeletal' },

  // Psychiatric
  { label: 'Major Depressive Disorder', icd10: 'F32.9', category: 'Psychiatric' },
  { label: 'Generalized Anxiety Disorder', icd10: 'F41.1', category: 'Psychiatric' },
  { label: 'Bipolar Disorder', icd10: 'F31.9', category: 'Psychiatric' },
  { label: 'Schizophrenia', icd10: 'F20.9', category: 'Psychiatric' },
];

export const DiagnosticSearchInput: React.FC<DiagnosticSearchInputProps> = ({
  value,
  onChange,
  onSelect,
  placeholder = 'Search diagnosis or ICD-10 code',
  recentSearches = [],
  quickPicks = [],
  forceClose = false,
}) => {
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<DiagnosticSuggestion[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Force close dropdown when parent requests it
  useEffect(() => {
    if (forceClose) {
      setFocused(false);
    }
  }, [forceClose]);

  // Filter suggestions based on input
  useEffect(() => {
    const query = value.trim().toLowerCase();
    
    if (!query || query.length < 2) {
      setSuggestions([]);
      return;
    }

    // Search in common diagnoses
    const matches = COMMON_DIAGNOSES.filter(
      (item) =>
        item.label.toLowerCase().includes(query) ||
        item.icd10?.toLowerCase().includes(query) ||
        item.category?.toLowerCase().includes(query)
    ).slice(0, 8);

    setSuggestions(matches);
  }, [value]);

  const handleSelect = (diagnosis: string, icd10?: string) => {
    onChange(diagnosis, icd10);
    onSelect?.(diagnosis, icd10);
    setFocused(false);
    inputRef.current?.blur();
  };

  const handleClear = () => {
    onChange('');
    inputRef.current?.focus();
  };

  const showSuggestions = focused && (suggestions.length > 0 || recentSearches.length > 0);
  const showQuickPicks = !value.trim() && quickPicks.length > 0;

  return (
    <div ref={containerRef} className="relative w-full z-[100]">
      {/* Search Input */}
      <div
        className={`h-12 rounded-2xl surface-strong px-4 inline-flex items-center gap-3 w-full transition-all ${
          focused ? 'ring-2 ring-accent-primary/30' : ''
        }`}
      >
        <Search size={16} className="text-content-dim shrink-0" />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          placeholder={placeholder}
          className="flex-1 text-sm text-content-primary bg-transparent outline-none"
        />
        {value && (
          <button
            onClick={handleClear}
            className="shrink-0 p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <X size={14} className="text-content-dim" />
          </button>
        )}
      </div>

      {/* Quick Picks (when empty) */}
      {showQuickPicks && !focused && (
        <div className="mt-3 flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {quickPicks.map((item, index) => (
            <button
              key={`quick-${index}`}
              onClick={() => handleSelect(item.label, item.icd10)}
              className="h-9 px-3.5 rounded-full surface-strong text-xs font-medium text-content-primary interactive-tap shrink-0 hover:bg-accent-primary/10 transition-colors"
            >
              <span className="block max-w-[10.5rem] truncate whitespace-nowrap">{item.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Suggestions Dropdown */}
      <AnimatePresence>
        {showSuggestions && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 right-0 mt-2 surface-raised rounded-2xl p-2 shadow-xl z-[110] max-h-[320px] overflow-y-auto"
          >
            {/* Recent Searches */}
            {recentSearches.length > 0 && !value.trim() && (
              <div className="mb-2">
                <p className="text-[10px] text-content-dim uppercase tracking-wide px-3 py-2">Recent</p>
                {recentSearches.map((item, index) => (
                  <button
                    key={`recent-${index}`}
                    onClick={() => handleSelect(item.label, item.icd10)}
                    className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-accent-primary/10 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-content-primary truncate">{item.label}</p>
                        {item.icd10 && (
                          <p className="text-[11px] text-content-dim mt-0.5">ICD-10: {item.icd10}</p>
                        )}
                      </div>
                      <ChevronRight size={14} className="text-content-dim shrink-0" />
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <div>
                <p className="text-[10px] text-content-dim uppercase tracking-wide px-3 py-2">
                  {value.trim() ? 'Suggestions' : 'Common Diagnoses'}
                </p>
                {suggestions.map((item, index) => (
                  <button
                    key={`suggestion-${index}`}
                    onClick={() => handleSelect(item.label, item.icd10)}
                    className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-accent-primary/10 transition-colors group"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-content-primary truncate">{item.label}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {item.icd10 && (
                            <span className="text-[11px] font-mono text-accent-primary">
                              {item.icd10}
                            </span>
                          )}
                          {item.category && (
                            <span className="text-[11px] text-content-dim">• {item.category}</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight size={14} className="text-content-dim shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

