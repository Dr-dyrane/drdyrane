import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarDays,
  Calculator,
  ChevronRight,
  Clock3,
  Copy,
  Printer,
  X,
} from 'lucide-react';
import { useClinical } from '../../core/context/ClinicalContext';
import { SessionRecord } from '../../core/types/clinical';
import { signalFeedback } from '../../core/services/feedback';
import { OverlayPortal } from '../../components/shared/OverlayPortal';
import { copyTextToClipboard } from '../../core/services/clipboard';
import { DiagnosticSearchInput } from './DiagnosticSearchInput';

type DoseFactor = number | 'ACTFactor' | 'ZincFactor' | 'ORSFactor';
type CalculatorMode = 'weight' | 'age';

interface DrugProtocolRow {
  name: string;
  form: string;
  factor: DoseFactor;
  max: number;
  unit: string;
  frequency: string;
  duration: string;
}

interface DrugProtocolEntry {
  value: string;
  label: string;
  drugs: DrugProtocolRow[];
}

interface RenderedDrugLine {
  form: string;
  medication: string;
  dose: string;
  frequency: string;
  duration: string;
}

const splitSearchBoundaries = (value: string): string =>
  value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-zA-Z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([a-zA-Z])/g, '$1 $2');

const normalize = (value: string): string =>
  splitSearchBoundaries(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const estimateWeightFromAge = (age: number | null): number | null => {
  if (age === null || Number.isNaN(age) || age <= 0) return null;
  if (age <= 12) return Math.max(8, Math.round(2 * age + 8));
  return 60;
};

const formatDoseValue = (value: number): string => {
  if (value >= 100) return String(Math.round(value));
  if (value >= 10) {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(Math.round(rounded)) : String(rounded);
  }
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(Math.round(rounded)) : String(rounded);
};

const getActBandDose = (weight: number): number => {
  if (weight >= 35) return 480;
  if (weight >= 25) return 360;
  if (weight >= 15) return 240;
  return 120;
};

const getZincBandDose = (weight: number): number => (weight <= 7 ? 10 : 20);

const getOrsBandDose = (weight: number): number => {
  if (weight < 10) return 75;
  if (weight <= 28) return 150;
  return 300;
};

const buildDose = (factor: DoseFactor, max: number, unit: string, weightKg: number | null): string => {
  const suffix = unit ? ` ${unit}` : '';
  if (weightKg === null) {
    if (factor === 'ACTFactor') return `Weight band dosing (${max}${suffix} max)`;
    if (factor === 'ZincFactor') return `Weight-based zinc (${max}${suffix} max)`;
    if (factor === 'ORSFactor') return `Weight-based ORS volume (${max}${suffix} max)`;
    // If no weight and no dose_per_kg, show max as fixed dose
    if (typeof factor === 'number' && factor === 0) return `${max}${suffix}`;
    return `Weight-based (${max}${suffix} max)`;
  }

  if (factor === 'ACTFactor') return `${getActBandDose(weightKg)}${suffix}`;
  if (factor === 'ZincFactor') return `${getZincBandDose(weightKg)}${suffix}`;
  if (factor === 'ORSFactor') return `${getOrsBandDose(weightKg)}${suffix}`;

  // If dose_per_kg is 0 or null, use max_dose as fixed dose
  if (typeof factor === 'number' && factor === 0) return `${max}${suffix}`;

  const numericDose = Math.min(weightKg * factor, max);
  return `${formatDoseValue(numericDose)}${suffix}`;
};

const isValidWeight = (weight: number): boolean => !Number.isNaN(weight) && weight > 0 && weight <= 300;
const isValidAge = (age: number): boolean => !Number.isNaN(age) && age >= 0 && age <= 125;

const formatTimestamp = (value: number): string =>
  new Date(value).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const recordIdFromProtocol = (value: string): string =>
  `rx-${normalize(value).replace(/\s+/g, '-').slice(0, 36)}-${Date.now()}`;

export const DrugProtocolsView: React.FC = () => {
  const { state, dispatch } = useClinical();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [protocols, setProtocols] = useState<DrugProtocolEntry[]>([]);
  const [llmProtocols, setLlmProtocols] = useState<DrugProtocolEntry[]>([]);
  const [activeProtocol, setActiveProtocol] = useState<DrugProtocolEntry | null>(null);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [weightInput, setWeightInput] = useState<string>(
    state.profile.weight_kg ? String(state.profile.weight_kg) : ''
  );
  const [ageInput, setAgeInput] = useState<string>(state.profile.age ? String(state.profile.age) : '');
  const [calculatorMode, setCalculatorMode] = useState<CalculatorMode>('weight');
  const [calcWeightInput, setCalcWeightInput] = useState<string>(
    state.profile.weight_kg ? String(state.profile.weight_kg) : ''
  );
  const [calcAgeInput, setCalcAgeInput] = useState<string>(state.profile.age ? String(state.profile.age) : '');
  const [calcDosePerKgInput, setCalcDosePerKgInput] = useState<string>('');
  const [calcDoseInput, setCalcDoseInput] = useState<string>('');
  const [calcStrengthInput, setCalcStrengthInput] = useState<string>('');
  const [calcVolumeInput, setCalcVolumeInput] = useState<string>('');
  const [selectedIcd10, setSelectedIcd10] = useState<string | undefined>();
  const [recentSearches, setRecentSearches] = useState<Array<{ label: string; icd10?: string }>>([]);

  const feedback = (kind: Parameters<typeof signalFeedback>[0] = 'select') =>
    signalFeedback(kind, {
      hapticsEnabled: state.settings.haptics_enabled,
      audioEnabled: state.settings.audio_enabled,
    });

  // Load fallback protocols from JSON (for offline/quick access)
  useEffect(() => {
    let isMounted = true;

    const loadProtocols = async () => {
      try {
        const response = await fetch('/data/drug-protocols.json');
        if (!response.ok) return; // Silently fail - LLM will handle searches
        const payload = (await response.json()) as DrugProtocolEntry[];
        const sanitized = Array.isArray(payload)
          ? payload
              .filter((item) => item && item.value && item.label && Array.isArray(item.drugs))
              .sort((a, b) => a.label.localeCompare(b.label))
          : [];
        if (!isMounted) return;
        setProtocols(sanitized);
      } catch (loadError) {
        // Silently fail - LLM will handle searches
        console.warn('[DrugProtocolsView] Fallback protocols unavailable:', loadError);
      }
    };

    void loadProtocols();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const profileWeight = state.profile.weight_kg ? String(state.profile.weight_kg) : '';
    const profileAge = state.profile.age ? String(state.profile.age) : '';
    setWeightInput(profileWeight);
    setAgeInput(profileAge);
    setCalcWeightInput(profileWeight);
    setCalcAgeInput(profileAge);
  }, [state.profile.age, state.profile.weight_kg]);

  useEffect(() => {
    const openCalculator = () => {
      setCalculatorOpen(true);
    };
    window.addEventListener('drdyrane:drug:open-calculator', openCalculator);
    return () => {
      window.removeEventListener('drdyrane:drug:open-calculator', openCalculator);
    };
  }, []);

  // LLM-driven prescription search
  useEffect(() => {
    let isMounted = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const searchWithLLM = async () => {
      const trimmedQuery = query.trim();
      if (!trimmedQuery || trimmedQuery.length < 3) {
        setLlmProtocols([]);
        setLoading(false);
        setError('');
        return;
      }

      setLoading(true);
      setError('');

      try {
        const response = await fetch('/api/generate-prescription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            diagnosis: trimmedQuery,
            icd10: selectedIcd10,
            age: state.profile.age,
            weight_kg: state.profile.weight_kg,
            sex: state.profile.sex,
            urgency: 'medium',
            soap: { S: {}, O: {}, A: {}, P: {} },
          }),
        });

        if (!response.ok) {
          throw new Error('Unable to generate prescription. Please try again.');
        }

        const llmResponse = await response.json();

        if (!isMounted) return;

        // Transform LLM response to DrugProtocolEntry format
        const llmProtocol: DrugProtocolEntry = {
          value: `llm-${normalize(trimmedQuery)}-${Date.now()}`,
          label: trimmedQuery,
          drugs: (llmResponse.prescriptions || []).map((rx: any) => ({
            name: rx.medication || rx.name || 'Unknown medication',
            form: rx.form || 'Tablet',
            factor: rx.dose_per_kg || 0,
            max: rx.max_dose || 9999,
            unit: rx.unit || 'mg',
            frequency: rx.frequency || 'Once daily',
            duration: rx.duration || '7 days',
          })),
        };

        setLlmProtocols([llmProtocol]);
        setError('');
      } catch (searchError) {
        if (!isMounted) return;
        console.error('[DrugProtocolsView] LLM search failed:', searchError);
        setError(searchError instanceof Error ? searchError.message : 'Unable to generate prescription.');
        setLlmProtocols([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    // Debounce search by 800ms
    timeoutId = setTimeout(() => {
      void searchWithLLM();
    }, 800);

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [query, selectedIcd10, state.profile.age, state.profile.weight_kg, state.profile.sex]);

  const protocolSearchIndex = useMemo(
    () =>
      protocols.map((entry) => {
        const drugTerms = entry.drugs
          .map((drug) => `${drug.name} ${drug.form}`)
          .join(' ');
        const searchable = normalize(`${entry.label} ${entry.value} ${drugTerms}`);
        return { entry, searchable };
      }),
    [protocols]
  );

  const filteredProtocols = useMemo(() => {
    const normalizedQuery = normalize(query);

    // If no query, show fallback protocols
    if (!normalizedQuery) return protocols.slice(0, 20);

    // Search hardcoded protocols first
    const queryTokens = normalizedQuery.split(' ').filter(Boolean);
    const hardcodedMatches = protocolSearchIndex
      .filter(({ searchable }) => queryTokens.every((token) => searchable.includes(token)))
      .map(({ entry }) => entry);

    // Combine hardcoded matches with LLM-generated protocols
    // LLM protocols appear first (more relevant for arbitrary diagnoses)
    return [...llmProtocols, ...hardcodedMatches];
  }, [protocolSearchIndex, protocols, llmProtocols, query]);

  const quickPickProtocols = useMemo(() => {
    // Prioritize common conditions from hardcoded protocols
    const commonConditions = protocols
      .filter((entry) =>
        /(malaria|hypertension|asthma|diabetes|pneumonia|gastro|urti|uti)/i.test(entry.label)
      )
      .slice(0, 8);

    // If we have enough, return them
    if (commonConditions.length >= 6) return commonConditions;

    // Otherwise, add some suggested searches
    const suggestions: DrugProtocolEntry[] = [
      { value: 'suggest-malaria', label: 'Malaria', drugs: [] },
      { value: 'suggest-hypertension', label: 'Hypertension', drugs: [] },
      { value: 'suggest-diabetes', label: 'Type 2 Diabetes', drugs: [] },
      { value: 'suggest-asthma', label: 'Acute Asthma', drugs: [] },
    ].filter(
      (suggestion) => !commonConditions.some((protocol) => protocol.label.toLowerCase().includes(suggestion.label.toLowerCase()))
    );

    return [...commonConditions, ...suggestions].slice(0, 8);
  }, [protocols]);

  const parsedWeight = Number(weightInput);
  const parsedAge = Number(ageInput);
  const explicitWeight = isValidWeight(parsedWeight) ? Math.round(parsedWeight * 10) / 10 : null;
  const validAge = isValidAge(parsedAge) ? Math.round(parsedAge) : null;
  const effectiveWeight = explicitWeight ?? estimateWeightFromAge(validAge);
  const weightSource =
    explicitWeight !== null ? 'Entered weight' : effectiveWeight !== null ? 'Age-estimated weight' : 'No weight';

  const activeProtocolRows: RenderedDrugLine[] = useMemo(() => {
    if (!activeProtocol) return [];
    return activeProtocol.drugs.map((drug) => ({
      form: drug.form,
      medication: drug.name,
      dose: buildDose(drug.factor, drug.max, drug.unit, effectiveWeight),
      frequency: (drug.frequency || '-').trim() || '-',
      duration: (drug.duration || '-').trim() || '-',
    }));
  }, [activeProtocol, effectiveWeight]);

  const upsertRxHistoryRecord = (entry: DrugProtocolEntry, sourceAction: 'copy' | 'pdf') => {
    const now = Date.now();
    const note = [
      `Source: Rx page (${sourceAction.toUpperCase()})`,
      `Weight basis: ${weightSource}${effectiveWeight !== null ? ` (${effectiveWeight} kg)` : ''}`,
      `Lines: ${activeProtocolRows.length}`,
    ].join(' | ');

    const record: SessionRecord = {
      id: recordIdFromProtocol(entry.value),
      timestamp: now,
      updated_at: now,
      source: 'rx',
      visit_label: `Rx ${new Date(now).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
      diagnosis: `${entry.label} protocol`,
      complaint: entry.label,
      notes: note,
      status: 'active',
      soap: state.soap,
      profile_snapshot: state.profile,
      clerking: { ...state.clerking },
      diagnostic_reviews: [...state.diagnostic_reviews],
      snapshot: {
        soap: state.soap,
        ddx: [...state.ddx],
        status: 'active',
        redFlag: false,
        pillars: state.pillars,
        conversation: [...state.conversation],
        agent_state: { ...state.agent_state },
        probability: state.probability,
        urgency: state.urgency,
        thinking: state.thinking,
        clerking: { ...state.clerking },
        diagnostic_reviews: [...state.diagnostic_reviews],
      },
      pillars: state.pillars || undefined,
    };
    dispatch({ type: 'UPSERT_ARCHIVE', payload: record });
  };
  const parsedCalcWeight = Number(calcWeightInput);
  const parsedCalcAge = Number(calcAgeInput);
  const parsedDosePerKg = Number(calcDosePerKgInput);
  const parsedDose = Number(calcDoseInput);
  const parsedStrength = Number(calcStrengthInput);
  const parsedVolume = Number(calcVolumeInput);

  const validCalcWeight = isValidWeight(parsedCalcWeight) ? Math.round(parsedCalcWeight * 10) / 10 : null;
  const validCalcAge = isValidAge(parsedCalcAge) ? Math.round(parsedCalcAge) : null;
  const calculatorWeight = calculatorMode === 'weight' ? validCalcWeight : estimateWeightFromAge(validCalcAge);
  const dosePerKg = Number.isFinite(parsedDosePerKg) && parsedDosePerKg > 0 ? parsedDosePerKg : null;
  const manualDose = Number.isFinite(parsedDose) && parsedDose > 0 ? parsedDose : null;
  const calculatedDose =
    manualDose ?? (calculatorWeight !== null && dosePerKg !== null ? calculatorWeight * dosePerKg : null);
  const concentration =
    Number.isFinite(parsedStrength) && parsedStrength > 0 && Number.isFinite(parsedVolume) && parsedVolume > 0
      ? parsedStrength / parsedVolume
      : null;
  const calculatedVolumeMl =
    calculatedDose !== null && concentration !== null && concentration > 0
      ? calculatedDose / concentration
      : null;

  const persistProfileContext = () => {
    const payload: { age?: number; weight_kg?: number } = {};
    if (validAge !== null && validAge !== state.profile.age) payload.age = validAge;
    if (validAge === null && state.profile.age !== undefined && ageInput.trim() === '') payload.age = undefined;
    if (explicitWeight !== null && explicitWeight !== state.profile.weight_kg) payload.weight_kg = explicitWeight;
    if (explicitWeight === null && state.profile.weight_kg !== undefined && weightInput.trim() === '') {
      payload.weight_kg = undefined;
    }
    if (Object.keys(payload).length > 0) {
      dispatch({ type: 'UPDATE_PROFILE', payload });
    }
  };

  const persistCalculatorProfileContext = () => {
    const payload: { age?: number; weight_kg?: number } = {};
    if (validCalcWeight !== null && validCalcWeight !== state.profile.weight_kg) {
      payload.weight_kg = validCalcWeight;
    }
    if (validCalcAge !== null && validCalcAge !== state.profile.age) {
      payload.age = validCalcAge;
    }
    if (Object.keys(payload).length > 0) {
      dispatch({ type: 'UPDATE_PROFILE', payload });
      feedback('submit');
    }
  };

  const openProtocol = (protocol: DrugProtocolEntry) => {
    setActiveProtocol(protocol);
    feedback('select');
  };

  const closeProtocol = () => {
    setActiveProtocol(null);
    feedback('select');
  };

  const exportActiveProtocolPdf = async () => {
    if (!activeProtocol) return;
    const { exportDrugProtocolPdf } = await import('../../core/pdf/clinicalPdf');
    feedback('submit');
    exportDrugProtocolPdf({
      generatedAt: Date.now(),
      protocolLabel: activeProtocol.label,
      weightBasis: `Weight basis: ${weightSource}${effectiveWeight ? ` (${effectiveWeight} kg)` : ''}`,
      patient: {
        displayName: state.profile.display_name,
        age: validAge ?? state.profile.age,
        sex: state.profile.sex,
        weightKg: explicitWeight ?? state.profile.weight_kg ?? null,
      },
      rows: activeProtocolRows,
    });
    upsertRxHistoryRecord(activeProtocol, 'pdf');
  };

  const copyActiveProtocol = async () => {
    if (!activeProtocol) return;
    const lines = [
      'Dr Dyrane Treatment Sheet',
      `Protocol: ${activeProtocol.label}`,
      `Generated: ${formatTimestamp(Date.now())}`,
      `Weight basis: ${weightSource}${effectiveWeight !== null ? ` (${effectiveWeight} kg)` : ''}`,
      'Prescription:',
      ...activeProtocolRows.map(
        (row, index) =>
          `${index + 1}. ${row.form} ${row.medication} ${row.dose} ${row.frequency} ${row.duration}`.replace(
            /\s+/g,
            ' '
          )
      ),
    ];
    const payload = lines.join('\n');
    const copied = await copyTextToClipboard(payload);
    if (copied) {
      feedback('submit');
      upsertRxHistoryRecord(activeProtocol, 'copy');
      return;
    }
    dispatch({
      type: 'ADD_NOTIFICATION',
      payload: {
        title: 'Copy Failed',
        body: 'Unable to copy treatment sheet automatically. Please try again.',
      },
    });
    feedback('error');
  };

  const openCalculatorSheet = () => {
    setCalculatorOpen(true);
    feedback('select');
  };

  return (
    <>
      <div className="flex-1 w-full min-w-0 overflow-x-hidden py-4 space-y-4 animate-emergence">
        <section className="surface-raised rounded-[24px] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs text-content-dim uppercase tracking-wide">Find Protocol</label>
            <button
              onClick={openCalculatorSheet}
              className="h-9 px-3 rounded-full surface-strong text-[11px] font-semibold text-content-primary inline-flex items-center gap-1.5 interactive-tap tap-compact"
            >
              <Calculator size={13} />
              Volume
            </button>
          </div>
          <DiagnosticSearchInput
            value={query}
            onChange={(value, icd10) => {
              setQuery(value);
              setSelectedIcd10(icd10);
            }}
            onSelect={(diagnosis, icd10) => {
              // Add to recent searches
              setRecentSearches((prev) => {
                const newSearch = { label: diagnosis, icd10 };
                const filtered = prev.filter((item) => item.label !== diagnosis);
                return [newSearch, ...filtered].slice(0, 5);
              });
              feedback('select');
            }}
            recentSearches={recentSearches}
            quickPicks={quickPickProtocols.map((entry) => ({
              label: entry.label,
              icd10: undefined,
            }))}
            forceClose={activeProtocol !== null || calculatorOpen}
          />
        </section>

        <section className="surface-raised rounded-[24px] p-4 space-y-3 pb-24">
          <div className="flex items-center justify-between">
            <p className="text-xs text-content-dim uppercase tracking-wide">Protocols</p>
            <p className="text-xs text-content-dim">{filteredProtocols.length} match(es)</p>
          </div>

          {loading && (
            <p className="text-sm text-content-secondary">
              {query.trim().length >= 3 ? 'Generating prescription...' : 'Loading treatment data...'}
            </p>
          )}
          {error && !loading && <p className="text-sm text-danger-primary">{error}</p>}
          {!loading && !error && filteredProtocols.length === 0 && query.trim().length >= 3 && (
            <p className="text-sm text-content-secondary">
              No prescription generated. Try refining your search or check your connection.
            </p>
          )}
          {!loading && !error && filteredProtocols.length === 0 && query.trim().length < 3 && query.trim().length > 0 && (
            <p className="text-sm text-content-secondary">Type at least 3 characters to search...</p>
          )}

          {!loading && !error && filteredProtocols.length > 0 && (
            <div className="space-y-2">
              {filteredProtocols.map((entry) => (
                <button
                  key={entry.value}
                  onClick={() => openProtocol(entry)}
                  className="w-full min-w-0 text-left rounded-2xl px-3.5 py-3 transition-all interactive-tap surface-strong text-content-primary"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-tight truncate">{entry.label}</p>
                      <p className="text-[11px] text-content-dim mt-1">{entry.drugs.length} medication line(s)</p>
                    </div>
                    <ChevronRight size={14} className="text-content-dim opacity-70" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <OverlayPortal>
        <AnimatePresence>
          {activeProtocol && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeProtocol}
                className="fixed inset-0 z-[140] overlay-backdrop backdrop-blur-sm"
              />

              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="fixed inset-x-0 bottom-0 h-[86vh] max-w-[440px] mx-auto z-[150] rounded-t-[32px] ios-sheet-surface shadow-modal pointer-events-auto flex flex-col overflow-hidden"
              >
                <div className="flex items-center justify-center pt-2 pb-1">
                  <span className="h-1 w-11 rounded-full surface-chip" />
                </div>

                <div className="px-5 py-4 flex items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <p className="text-xs text-content-dim font-medium">Protocol Detail</p>
                    <p className="text-sm text-content-primary font-semibold truncate">{activeProtocol.label}</p>
                  </div>
                  <button
                    onClick={closeProtocol}
                    className="h-10 w-10 rounded-full surface-strong flex items-center justify-center interactive-tap interactive-soft"
                    aria-label="Close protocol details"
                  >
                    <X size={15} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar px-5 pb-[calc(env(safe-area-inset-bottom)+1.1rem)] space-y-4">
                  <section className="surface-raised rounded-[22px] p-4 space-y-3">
                    <p className="text-xs text-content-dim uppercase tracking-wide">Dosing Context</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="surface-strong rounded-2xl px-3 py-2">
                        <label className="text-[11px] text-content-dim uppercase tracking-wide">Weight (kg)</label>
                        <input
                          value={weightInput}
                          onChange={(event) => setWeightInput(event.target.value)}
                          onBlur={persistProfileContext}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              persistProfileContext();
                            }
                          }}
                          type="number"
                          min={1}
                          max={300}
                          step="0.1"
                          placeholder="Optional"
                          className="h-9 w-full text-sm text-content-primary"
                        />
                      </div>

                      <div className="surface-strong rounded-2xl px-3 py-2">
                        <label className="text-[11px] text-content-dim uppercase tracking-wide">Age (years)</label>
                        <input
                          value={ageInput}
                          onChange={(event) => setAgeInput(event.target.value)}
                          onBlur={persistProfileContext}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              persistProfileContext();
                            }
                          }}
                          type="number"
                          min={0}
                          max={125}
                          placeholder="Optional"
                          className="h-9 w-full text-sm text-content-primary"
                        />
                      </div>
                    </div>

                    <p className="text-[11px] text-content-dim">
                      {weightSource}
                      {effectiveWeight !== null ? ` (${effectiveWeight} kg)` : ''}
                    </p>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        onClick={() => void copyActiveProtocol()}
                        className="h-11 rounded-2xl surface-strong text-xs font-semibold inline-flex items-center justify-center gap-1.5 interactive-tap"
                      >
                        <Copy size={14} />
                        Copy
                      </button>
                      <button
                        onClick={() => void exportActiveProtocolPdf()}
                        className="h-11 rounded-2xl cta-live text-xs font-semibold inline-flex items-center justify-center gap-1.5 interactive-tap"
                      >
                        <Printer size={14} />
                        Export PDF
                      </button>
                    </div>
                  </section>

                  <section className="surface-raised rounded-[22px] p-4 space-y-2">
                    <p className="text-xs text-content-dim uppercase tracking-wide">Prescription Lines</p>
                    {activeProtocolRows.map((row, index) => (
                      <div key={`${row.medication}-${index}`} className="surface-strong rounded-2xl px-3.5 py-3 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-content-primary leading-snug min-w-0">
                            {index + 1}. {row.form} {row.medication}
                          </p>
                          <span className="h-7 px-3 rounded-full bg-surface-active text-content-active text-xs font-semibold inline-flex items-center shrink-0">
                            {row.dose}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-content-secondary">
                          <span className="h-7 px-2.5 rounded-full surface-chip inline-flex items-center gap-1.5">
                            <Clock3 size={12} />
                            {row.frequency}
                          </span>
                          <span className="h-7 px-2.5 rounded-full surface-chip inline-flex items-center gap-1.5">
                            <CalendarDays size={12} />
                            {row.duration}
                          </span>
                        </div>
                      </div>
                    ))}
                  </section>
                </div>
              </motion.div>
            </>
          )}

          {calculatorOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setCalculatorOpen(false)}
                className="fixed inset-0 z-[140] overlay-backdrop backdrop-blur-sm"
              />

              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="fixed inset-x-0 bottom-0 h-[82vh] max-w-[440px] mx-auto z-[150] rounded-t-[32px] ios-sheet-surface shadow-modal pointer-events-auto flex flex-col overflow-hidden"
              >
                <div className="flex items-center justify-center pt-2 pb-1">
                  <span className="h-1 w-11 rounded-full surface-chip" />
                </div>

                <div className="px-5 py-4 flex items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <p className="text-xs text-content-dim font-medium">Dose Form</p>
                    <p className="text-sm text-content-primary font-semibold truncate">Volume Calculator</p>
                  </div>
                  <button
                    onClick={() => setCalculatorOpen(false)}
                    className="h-10 w-10 rounded-full surface-strong flex items-center justify-center interactive-tap"
                    aria-label="Close volume calculator"
                  >
                    <X size={15} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] space-y-4">
                  <section className="surface-raised rounded-[22px] p-4 space-y-3">
                    <div className="surface-strong rounded-[18px] p-1 grid grid-cols-2 gap-1.5">
                      <button
                        onClick={() => setCalculatorMode('weight')}
                        className={`relative h-10 rounded-xl text-xs font-semibold uppercase tracking-wide interactive-tap ${
                          calculatorMode === 'weight' ? 'text-content-active' : 'text-content-secondary'
                        }`}
                      >
                        {calculatorMode === 'weight' ? (
                          <motion.span
                            layoutId="volume-calculator-mode-pill"
                            className="absolute inset-0 rounded-xl bg-surface-active selected-elevation"
                            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                          />
                        ) : (
                          <span className="absolute inset-0 rounded-xl surface-chip" />
                        )}
                        <span className="relative z-10">Weight</span>
                      </button>

                      <button
                        onClick={() => setCalculatorMode('age')}
                        className={`relative h-10 rounded-xl text-xs font-semibold uppercase tracking-wide interactive-tap ${
                          calculatorMode === 'age' ? 'text-content-active' : 'text-content-secondary'
                        }`}
                      >
                        {calculatorMode === 'age' ? (
                          <motion.span
                            layoutId="volume-calculator-mode-pill"
                            className="absolute inset-0 rounded-xl bg-surface-active selected-elevation"
                            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                          />
                        ) : (
                          <span className="absolute inset-0 rounded-xl surface-chip" />
                        )}
                        <span className="relative z-10">Age</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {calculatorMode === 'weight' ? (
                        <div className="surface-strong rounded-2xl px-3 py-2 col-span-2">
                          <label className="text-[11px] text-content-dim uppercase tracking-wide">Weight (kg)</label>
                          <input
                            value={calcWeightInput}
                            onChange={(event) => setCalcWeightInput(event.target.value)}
                            type="number"
                            min={1}
                            max={300}
                            step="0.1"
                            placeholder="kg"
                            className="h-9 w-full text-sm text-content-primary"
                          />
                        </div>
                      ) : (
                        <div className="surface-strong rounded-2xl px-3 py-2 col-span-2">
                          <label className="text-[11px] text-content-dim uppercase tracking-wide">Age (years)</label>
                          <input
                            value={calcAgeInput}
                            onChange={(event) => setCalcAgeInput(event.target.value)}
                            type="number"
                            min={0}
                            max={125}
                            placeholder="years"
                            className="h-9 w-full text-sm text-content-primary"
                          />
                        </div>
                      )}

                      <div className="surface-strong rounded-2xl px-3 py-2">
                        <label className="text-[11px] text-content-dim uppercase tracking-wide">Dose/kg (mg/kg)</label>
                        <input
                          value={calcDosePerKgInput}
                          onChange={(event) => setCalcDosePerKgInput(event.target.value)}
                          type="number"
                          min={0}
                          step="0.1"
                          placeholder="e.g. 15"
                          className="h-9 w-full text-sm text-content-primary"
                        />
                      </div>

                      <div className="surface-strong rounded-2xl px-3 py-2">
                        <label className="text-[11px] text-content-dim uppercase tracking-wide">Dose (mg) *</label>
                        <input
                          value={calcDoseInput}
                          onChange={(event) => setCalcDoseInput(event.target.value)}
                          type="number"
                          min={0}
                          step="0.1"
                          placeholder="optional override"
                          className="h-9 w-full text-sm text-content-primary"
                        />
                      </div>

                      <div className="surface-strong rounded-2xl px-3 py-2">
                        <label className="text-[11px] text-content-dim uppercase tracking-wide">Drug Strength (mg) *</label>
                        <input
                          value={calcStrengthInput}
                          onChange={(event) => setCalcStrengthInput(event.target.value)}
                          type="number"
                          min={0}
                          step="0.1"
                          placeholder="e.g. 250"
                          className="h-9 w-full text-sm text-content-primary"
                        />
                      </div>

                      <div className="surface-strong rounded-2xl px-3 py-2">
                        <label className="text-[11px] text-content-dim uppercase tracking-wide">Drug Volume (ml) *</label>
                        <input
                          value={calcVolumeInput}
                          onChange={(event) => setCalcVolumeInput(event.target.value)}
                          type="number"
                          min={0}
                          step="0.1"
                          placeholder="e.g. 5"
                          className="h-9 w-full text-sm text-content-primary"
                        />
                      </div>
                    </div>

                    <div className="surface-strong rounded-2xl p-3 space-y-1.5 text-sm">
                      <p className="text-content-secondary">
                        Weight basis:{' '}
                        <span className="text-content-primary font-semibold">
                          {calculatorWeight !== null ? `${formatDoseValue(calculatorWeight)} kg` : 'not set'}
                        </span>
                      </p>
                      <p className="text-content-secondary">
                        Calculated dose:{' '}
                        <span className="text-content-primary font-semibold">
                          {calculatedDose !== null ? `${formatDoseValue(calculatedDose)} mg` : 'not available'}
                        </span>
                      </p>
                      <p className="text-content-secondary">
                        Dose volume:{' '}
                        <span className="text-content-primary font-semibold">
                          {calculatedVolumeMl !== null ? `${formatDoseValue(calculatedVolumeMl)} ml` : 'not available'}
                        </span>
                      </p>
                    </div>

                    <button
                      onClick={persistCalculatorProfileContext}
                      className="h-11 w-full rounded-2xl surface-strong text-xs font-semibold inline-flex items-center justify-center gap-1.5 interactive-tap"
                    >
                      Save Weight/Age to Profile
                    </button>
                  </section>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </OverlayPortal>
    </>
  );
};
