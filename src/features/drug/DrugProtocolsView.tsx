import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Pill, Printer, Search } from 'lucide-react';
import { useClinical } from '../../core/context/ClinicalContext';

type DoseFactor = number | 'ACTFactor' | 'ZincFactor' | 'ORSFactor';

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

const normalize = (value: string): string =>
  value
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
  const rounded = Math.round(value * 10) / 10;
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
    return `Weight-based (${max}${suffix} max)`;
  }

  if (factor === 'ACTFactor') return `${getActBandDose(weightKg)}${suffix}`;
  if (factor === 'ZincFactor') return `${getZincBandDose(weightKg)}${suffix}`;
  if (factor === 'ORSFactor') return `${getOrsBandDose(weightKg)}${suffix}`;

  const numericDose = Math.min(weightKg * factor, max);
  return `${formatDoseValue(numericDose)}${suffix}`;
};

const isValidWeight = (weight: number): boolean => !Number.isNaN(weight) && weight > 0 && weight <= 300;

const isValidAge = (age: number): boolean => !Number.isNaN(age) && age >= 0 && age <= 125;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

export const DrugProtocolsView: React.FC = () => {
  const { state, dispatch } = useClinical();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [protocols, setProtocols] = useState<DrugProtocolEntry[]>([]);
  const [selectedValue, setSelectedValue] = useState('');
  const [weightInput, setWeightInput] = useState<string>(state.profile.weight_kg ? String(state.profile.weight_kg) : '');
  const [ageInput, setAgeInput] = useState<string>(state.profile.age ? String(state.profile.age) : '');

  useEffect(() => {
    let isMounted = true;
    const loadProtocols = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/data/drug-protocols.json');
        if (!response.ok) throw new Error('Unable to load treatment dataset.');
        const payload = (await response.json()) as DrugProtocolEntry[];
        const sanitized = Array.isArray(payload)
          ? payload
              .filter((item) => item && item.value && item.label && Array.isArray(item.drugs))
              .sort((a, b) => a.label.localeCompare(b.label))
          : [];
        if (!isMounted) return;
        setProtocols(sanitized);
        setSelectedValue((current) => current || sanitized[0]?.value || '');
      } catch (loadError) {
        if (!isMounted) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load treatment dataset.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadProtocols();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    setWeightInput(state.profile.weight_kg ? String(state.profile.weight_kg) : '');
    setAgeInput(state.profile.age ? String(state.profile.age) : '');
  }, [state.profile.age, state.profile.weight_kg]);

  const filteredProtocols = useMemo(() => {
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) return protocols;
    return protocols.filter((entry) => {
      const label = normalize(entry.label);
      const value = normalize(entry.value);
      return label.includes(normalizedQuery) || value.includes(normalizedQuery);
    });
  }, [protocols, query]);

  useEffect(() => {
    if (filteredProtocols.length === 0) {
      setSelectedValue('');
      return;
    }
    const exists = filteredProtocols.some((item) => item.value === selectedValue);
    if (!exists) {
      setSelectedValue(filteredProtocols[0].value);
    }
  }, [filteredProtocols, selectedValue]);

  const selectedProtocol =
    filteredProtocols.find((item) => item.value === selectedValue) ||
    protocols.find((item) => item.value === selectedValue) ||
    null;

  const parsedWeight = Number(weightInput);
  const parsedAge = Number(ageInput);
  const explicitWeight = isValidWeight(parsedWeight) ? Math.round(parsedWeight * 10) / 10 : null;
  const validAge = isValidAge(parsedAge) ? Math.round(parsedAge) : null;
  const effectiveWeight = explicitWeight ?? estimateWeightFromAge(validAge);
  const weightSource =
    explicitWeight !== null ? 'Entered weight' : effectiveWeight !== null ? 'Age-estimated weight' : 'No weight';

  const printSelectedProtocol = () => {
    if (!selectedProtocol) return;
    const rows = selectedProtocol.drugs
      .map((drug) => {
        const dose = buildDose(drug.factor, drug.max, drug.unit, effectiveWeight);
        return `<tr>
          <td>${escapeHtml(drug.form)}</td>
          <td>${escapeHtml(drug.name)}</td>
          <td>${escapeHtml(dose)}</td>
          <td>${escapeHtml(drug.frequency || '-')}</td>
          <td>${escapeHtml((drug.duration || '').trim() || '-')}</td>
        </tr>`;
      })
      .join('');

    const html = `
      <html>
      <head>
        <title>Dr Dyrane Treatment Sheet</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif; padding: 24px; color: #111; }
          h1 { font-size: 22px; margin: 0 0 8px; }
          h2 { font-size: 15px; margin: 16px 0 8px; }
          table { width: 100%; border-collapse: separate; border-spacing: 0 6px; font-size: 12px; }
          th, td { text-align: left; padding: 8px 8px; border: 0; }
          tbody td { background: #f6f7f8; }
          tbody td:first-child { border-top-left-radius: 8px; border-bottom-left-radius: 8px; }
          tbody td:last-child { border-top-right-radius: 8px; border-bottom-right-radius: 8px; }
          .chip { display: inline-block; padding: 4px 8px; border-radius: 999px; background: #f4f4f5; font-size: 11px; margin-right: 8px; }
        </style>
      </head>
      <body>
        <h1>Dr Dyrane Treatment Sheet</h1>
        <div class="chip">${escapeHtml(selectedProtocol.label)}</div>
        <div class="chip">Weight basis: ${escapeHtml(weightSource)}${effectiveWeight ? ` (${escapeHtml(String(effectiveWeight))} kg)` : ''}</div>
        <h2>Prescription</h2>
        <table>
          <thead>
            <tr><th>Form</th><th>Medication</th><th>Dose</th><th>Frequency</th><th>Duration</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
      </html>
    `;

    const printWin = window.open('', '_blank', 'noopener,noreferrer,width=980,height=900');
    if (!printWin) {
      window.print();
      return;
    }
    printWin.document.write(html);
    printWin.document.close();
    printWin.focus();
    printWin.print();
    printWin.close();
  };

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

  return (
    <div className="flex-1 px-2 py-7 space-y-6 animate-emergence">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
        <div className="inline-flex items-center gap-2 h-8 px-3 rounded-full surface-chip text-xs text-content-secondary">
          <Pill size={13} />
          Drug Formulary
        </div>
        <h1 className="display-type text-[1.8rem] leading-tight tracking-tight text-content-primary">
          Quick Treatment Sheets
        </h1>
        <p className="text-sm text-content-secondary">
          Search a known diagnosis or workflow, then print a treatment plan instantly.
        </p>
      </motion.div>

      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="surface-raised rounded-[24px] p-4 space-y-3"
      >
        <label className="text-xs text-content-dim uppercase tracking-wide">Search Treatment</label>
        <div className="h-11 rounded-2xl surface-strong px-3 inline-flex items-center gap-2 w-full">
          <Search size={15} className="text-content-dim" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Malaria, hypertension, asthma..."
            className="w-full text-sm text-content-primary"
          />
        </div>

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
          Dosing basis: {weightSource}
          {effectiveWeight !== null ? ` (${effectiveWeight} kg)` : ''}.
        </p>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="surface-raised rounded-[24px] p-4 space-y-3"
      >
        <div className="flex items-center justify-between">
          <p className="text-xs text-content-dim uppercase tracking-wide">Diagnosis Library</p>
          <p className="text-xs text-content-dim">{filteredProtocols.length} match(es)</p>
        </div>

        {loading && <p className="text-sm text-content-secondary">Loading treatment data...</p>}
        {error && !loading && <p className="text-sm text-danger-primary">{error}</p>}
        {!loading && !error && filteredProtocols.length === 0 && (
          <p className="text-sm text-content-secondary">No result found. Try another search term.</p>
        )}

        {!loading && !error && filteredProtocols.length > 0 && (
          <div className="max-h-[220px] overflow-y-auto no-scrollbar space-y-2 pr-1">
            {filteredProtocols.map((entry) => {
              const isActive = selectedValue === entry.value;
              return (
                <button
                  key={entry.value}
                  onClick={() => setSelectedValue(entry.value)}
                  className={`w-full text-left rounded-2xl px-3.5 py-3 transition-all interactive-tap ${
                    isActive ? 'bg-surface-active selected-elevation text-content-active' : 'surface-strong text-content-primary'
                  }`}
                >
                  <p className="text-sm font-semibold leading-tight">{entry.label}</p>
                  <p className="text-[11px] text-content-dim mt-1">{entry.drugs.length} medication line(s)</p>
                </button>
              );
            })}
          </div>
        )}
      </motion.section>

      {selectedProtocol && (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="surface-raised rounded-[24px] p-4 space-y-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-content-dim uppercase tracking-wide">Selected Treatment</p>
              <h2 className="text-base font-semibold text-content-primary leading-tight mt-1">{selectedProtocol.label}</h2>
            </div>
            <button
              onClick={printSelectedProtocol}
              className="h-10 px-3 rounded-2xl surface-strong text-xs font-semibold inline-flex items-center gap-1.5 interactive-tap"
            >
              <Printer size={14} />
              Print
            </button>
          </div>

          <div className="space-y-2">
            {selectedProtocol.drugs.map((drug, index) => {
              const dose = buildDose(drug.factor, drug.max, drug.unit, effectiveWeight);
              return (
                <div key={`${drug.name}-${index}`} className="surface-strong rounded-2xl px-3.5 py-3">
                  <p className="text-sm font-semibold text-content-primary">
                    {drug.form} {drug.name}
                  </p>
                  <p className="text-xs text-content-secondary mt-1">
                    {dose} | {(drug.frequency || '-').trim() || '-'} | {(drug.duration || '-').trim() || '-'}
                  </p>
                </div>
              );
            })}
          </div>
        </motion.section>
      )}
    </div>
  );
};
