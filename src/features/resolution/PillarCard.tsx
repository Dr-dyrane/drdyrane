import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useClinical } from '../../core/context/ClinicalContext';
import { Activity, Copy, Printer, Shield, TrendingUp, UserCheck } from 'lucide-react';
import { Orb } from '../consultation/Orb';
import { PillarData } from '../../core/types/clinical';

type EncounterPrescription = NonNullable<NonNullable<PillarData['encounter']>['prescriptions'][number]>;

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

const isValidWeight = (value: number): boolean => !Number.isNaN(value) && value > 0 && value <= 300;

const formatTimestamp = (value: number): string =>
  new Date(value).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const resolveDoseFromWeight = (item: EncounterPrescription, weightKg: number | null): string => {
  const meta = item.weight_based;
  if (!meta) return item.dose;
  if (weightKg === null) return item.dose;

  const suffix = meta.unit ? ` ${meta.unit}` : '';
  switch (meta.mode) {
    case 'act_band':
      return `${getActBandDose(weightKg)}${suffix}`;
    case 'zinc_band':
      return `${getZincBandDose(weightKg)}${suffix}`;
    case 'ors_band':
      return `${getOrsBandDose(weightKg)}${suffix}`;
    case 'per_kg': {
      if (typeof meta.factor !== 'number') return item.dose;
      const maxDose = typeof meta.max_dose === 'number' ? meta.max_dose : Number.MAX_SAFE_INTEGER;
      const computed = Math.round(Math.min(weightKg * meta.factor, maxDose));
      return `${computed}${suffix}`;
    }
    default:
      return item.dose;
  }
};

export const PillarCard: React.FC = () => {
  const { state, dispatch } = useClinical();
  const isComplete = state.status === 'complete' && Boolean(state.pillars);
  const encounter = state.pillars?.encounter;
  const [weightInput, setWeightInput] = useState<string>(
    state.profile.weight_kg ? String(state.profile.weight_kg) : ''
  );

  useEffect(() => {
    setWeightInput(state.profile.weight_kg ? String(state.profile.weight_kg) : '');
  }, [state.profile.weight_kg]);

  const parsedWeight = Number(weightInput);
  const enteredWeight = isValidWeight(parsedWeight) ? Math.round(parsedWeight * 10) / 10 : null;
  const hasWeightBasedRx = Boolean(encounter?.prescriptions.some((item) => Boolean(item.weight_based)));

  const prescriptionsForRender: EncounterPrescription[] = useMemo(
    () =>
      (encounter?.prescriptions || []).map((item) => ({
        ...item,
        dose: resolveDoseFromWeight(item, enteredWeight),
      })),
    [encounter?.prescriptions, enteredWeight]
  );

  const escapeHtml = (value: string): string =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const persistWeightToProfile = () => {
    const profileWeight = state.profile.weight_kg;
    if (enteredWeight === null) {
      if (profileWeight !== undefined) {
        dispatch({ type: 'UPDATE_PROFILE', payload: { weight_kg: undefined } });
      }
      return;
    }

    if (profileWeight !== enteredWeight) {
      dispatch({ type: 'UPDATE_PROFILE', payload: { weight_kg: enteredWeight } });
    }
  };

  const printEncounter = () => {
    if (!state.pillars) return;
    const plan = state.pillars;
    const generatedAt = formatTimestamp(Date.now());
    const patientContext = [
      state.profile.display_name ? `Name: ${state.profile.display_name}` : null,
      state.profile.age ? `Age: ${state.profile.age}` : null,
      state.profile.sex ? `Sex: ${state.profile.sex}` : null,
      enteredWeight ? `Weight: ${enteredWeight} kg` : null,
    ]
      .filter(Boolean)
      .join(' | ');
    const investigations = (plan.encounter?.investigations || [])
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join('');
    const prescriptions = prescriptionsForRender
      .map(
        (item) =>
          `<tr>
            <td>${escapeHtml(item.medication)}</td>
            <td>${escapeHtml(item.form)}</td>
            <td>${escapeHtml(item.dose)}</td>
            <td>${escapeHtml(item.frequency)}</td>
            <td>${escapeHtml(item.duration)}</td>
            <td>${escapeHtml(item.note || '')}</td>
          </tr>`
      )
      .join('');
    const counseling = (plan.encounter?.counseling || [])
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join('');
    const followUp = (plan.encounter?.follow_up || [])
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join('');

    const content = `
      <html>
      <head>
        <title>Dr Dyrane Prescription Summary</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif; padding: 26px; color: #111; background: #f3f4f6; }
          h1 { font-size: 22px; margin: 0; }
          h2 { font-size: 14px; margin: 0 0 8px; letter-spacing: 0.02em; text-transform: uppercase; color: #3f4652; }
          p { line-height: 1.45; white-space: pre-line; margin: 0; }
          ul { margin: 0; padding-left: 18px; line-height: 1.45; }
          table { width: 100%; border-collapse: separate; border-spacing: 0 6px; margin-top: 8px; font-size: 12px; }
          th, td { text-align: left; padding: 8px 8px; border: 0; }
          tbody td { background: #f0f2f5; }
          tbody td:first-child { border-top-left-radius: 8px; border-bottom-left-radius: 8px; }
          tbody td:last-child { border-top-right-radius: 8px; border-bottom-right-radius: 8px; }
          .sheet { max-width: 860px; margin: 0 auto; background: #fff; border-radius: 24px; padding: 24px; box-shadow: 0 20px 45px rgba(15, 23, 42, 0.12); }
          .meta-row { margin-top: 8px; font-size: 12px; color: #4b5563; }
          .chips { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px; }
          .chip { display: inline-block; padding: 5px 9px; border-radius: 999px; background: #eef2ff; color: #1f2937; font-size: 11px; }
          .section { margin-top: 14px; background: #f8fafc; border-radius: 16px; padding: 14px; }
          .note { margin-top: 16px; font-size: 11px; color: #6b7280; }
          @media print {
            body { background: #fff; padding: 0; }
            .sheet { box-shadow: none; border-radius: 0; max-width: none; padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          <h1>Dr Dyrane Clinical Encounter</h1>
          <div class="meta-row">Generated: ${escapeHtml(generatedAt)}</div>
          ${patientContext ? `<div class="meta-row">${escapeHtml(patientContext)}</div>` : ''}
          <div class="chips">
            <span class="chip">Prescription-ready summary</span>
            ${
              hasWeightBasedRx
                ? `<span class="chip">Dosing weight: ${
                    enteredWeight ? `${escapeHtml(String(enteredWeight))} kg` : 'Not entered'
                  }</span>`
                : ''
            }
          </div>

          <div class="section">
            <h2>Diagnosis</h2>
            <p>${escapeHtml(plan.diagnosis)}</p>
          </div>

          <div class="section">
            <h2>Management</h2>
            <p>${escapeHtml(plan.management)}</p>
          </div>

          ${
            investigations
              ? `<div class="section"><h2>Investigations</h2><ul>${investigations}</ul></div>`
              : ''
          }
          ${
            prescriptions
              ? `<div class="section"><h2>Prescription</h2>
                  <table>
                    <thead><tr><th>Medication</th><th>Form</th><th>Dose</th><th>Frequency</th><th>Duration</th><th>Note</th></tr></thead>
                    <tbody>${prescriptions}</tbody>
                  </table>
                </div>`
              : ''
          }
          ${
            counseling
              ? `<div class="section"><h2>Pharmacy Counseling</h2><ul>${counseling}</ul></div>`
              : ''
          }
          ${
            followUp
              ? `<div class="section"><h2>Follow-Up</h2><ul>${followUp}</ul></div>`
              : ''
          }

          <div class="section">
            <h2>Prognosis</h2>
            <p>${escapeHtml(plan.prognosis)}</p>
          </div>
          <div class="section">
            <h2>Prevention</h2>
            <p>${escapeHtml(plan.prevention)}</p>
          </div>

          <p class="note">Clinical decision support output. Requires licensed clinician confirmation.</p>
        </div>
      </body>
      </html>
    `;

    const printWin = window.open('', '_blank', 'noopener,noreferrer,width=900,height=980');
    if (!printWin) {
      window.print();
      return;
    }

    printWin.document.write(content);
    printWin.document.close();
    printWin.focus();
    printWin.print();
    printWin.close();
  };

  const reset = () => {
    dispatch({ type: 'RESET' });
  };

  const copySummary = async () => {
    if (!state.pillars) return;
    const plan = state.pillars;
    const lines = [
      'Dr Dyrane Clinical Encounter',
      `Diagnosis: ${plan.diagnosis}`,
      `Management: ${plan.management}`,
      ...(prescriptionsForRender.length > 0
        ? [
            'Prescription:',
            ...prescriptionsForRender.map(
              (item) => `${item.form} ${item.medication} ${item.dose} ${item.frequency} ${item.duration}`.replace(/\s+/g, ' ')
            ),
          ]
        : []),
      ...(plan.encounter?.follow_up?.length ? [`Follow-up: ${plan.encounter.follow_up.join(' | ')}`] : []),
    ];
    const payload = lines.join('\n');
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      window.prompt('Copy clinical summary', payload);
    }
  };

  if (!isComplete || !state.pillars) return null;

  const pillars = [
    { title: 'Diagnosis', icon: Activity, content: state.pillars.diagnosis },
    ...(encounter ? [] : [{ title: 'Management', icon: Shield, content: state.pillars.management }]),
    { title: 'Prognosis', icon: TrendingUp, content: state.pillars.prognosis },
    { title: 'Prevention', icon: UserCheck, content: state.pillars.prevention },
  ];
  const patientContextBits = [
    state.profile.display_name ? state.profile.display_name : null,
    state.profile.age ? `${state.profile.age}y` : null,
    state.profile.sex ? state.profile.sex : null,
    enteredWeight ? `${enteredWeight} kg` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="flex-1 px-2 py-7 space-y-7 animate-emergence">
      <div className="flex justify-center">
        <Orb />
      </div>
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center space-y-2"
      >
        <h1 className="display-type text-[1.9rem] text-content-primary leading-tight tracking-tight px-4">
          Conclusion
        </h1>
        <p className="text-sm text-content-dim">Clinical synthesis complete</p>
        {patientContextBits.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            {patientContextBits.map((bit) => (
              <span key={bit} className="h-7 px-3 rounded-full surface-chip text-[11px] text-content-secondary inline-flex items-center">
                {bit}
              </span>
            ))}
          </div>
        )}
      </motion.div>

      <div className="flex flex-col gap-6 pb-24">
        {pillars.map((pillar, idx) => (
          <motion.div
            key={pillar.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + idx * 0.1 }}
            className="p-6 bg-surface-muted rounded-[24px] space-y-4 shadow-glass"
          >
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-accent-soft rounded-2xl">
                <pillar.icon className="w-5 h-5 text-accent-primary" />
              </div>
              <h3 className="text-xs font-semibold text-content-dim tracking-wide">{pillar.title}</h3>
            </div>
            <p className="text-base leading-relaxed text-content-secondary pr-2 whitespace-pre-line">
              {pillar.content}
            </p>
          </motion.div>
        ))}

        {encounter && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="p-6 bg-surface-muted rounded-[24px] space-y-5 shadow-glass"
          >
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-accent-soft rounded-2xl">
                <Shield className="w-5 h-5 text-accent-primary" />
              </div>
              <div>
                <h3 className="text-xs font-semibold text-content-dim tracking-wide">Management Encounter</h3>
                {encounter.source && (
                  <p className="text-[11px] text-content-dim mt-1">{encounter.source}</p>
                )}
              </div>
            </div>

            {encounter.investigations.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-content-dim tracking-wide uppercase">Investigations</p>
                <div className="space-y-2">
                  {encounter.investigations.map((item, index) => (
                    <p key={`investigation-${index}`} className="text-sm leading-relaxed text-content-secondary">
                      {index + 1}. {item}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {encounter.prescriptions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-content-dim tracking-wide uppercase">Prescription</p>
                {hasWeightBasedRx && (
                  <div className="surface-raised rounded-2xl px-3.5 py-3 space-y-2">
                    <p className="text-xs text-content-dim uppercase tracking-wide">Weight-Aware Dosing</p>
                    <input
                      value={weightInput}
                      onChange={(event) => setWeightInput(event.target.value)}
                      onBlur={persistWeightToProfile}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          persistWeightToProfile();
                        }
                      }}
                      type="number"
                      min={1}
                      max={300}
                      step="0.1"
                      placeholder="Enter patient weight in kg"
                      className="w-full h-11 px-3 rounded-xl surface-strong text-sm text-content-primary"
                    />
                    <p className="text-[11px] text-content-dim">
                      Dose rows and print export update from entered weight.
                    </p>
                  </div>
                )}
                <div className="space-y-2">
                  {prescriptionsForRender.map((item, index) => (
                    <div key={`rx-${item.medication}-${index}`} className="surface-raised rounded-2xl px-3.5 py-3">
                      <p className="text-sm font-semibold text-content-primary">
                        {item.medication} <span className="text-content-dim font-normal">({item.form})</span>
                      </p>
                      <p className="text-xs text-content-secondary mt-1">
                        {item.dose} | {item.frequency} | {item.duration}
                      </p>
                      {item.note && <p className="text-xs text-content-dim mt-1">{item.note}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {encounter.counseling.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-content-dim tracking-wide uppercase">Pharmacy Counseling</p>
                <div className="space-y-2">
                  {encounter.counseling.map((item, index) => (
                    <p key={`counsel-${index}`} className="text-sm leading-relaxed text-content-secondary">
                      {index + 1}. {item}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {encounter.follow_up.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-content-dim tracking-wide uppercase">Follow-Up</p>
                <div className="space-y-2">
                  {encounter.follow_up.map((item, index) => (
                    <p key={`follow-${index}`} className="text-sm leading-relaxed text-content-secondary">
                      {index + 1}. {item}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-8"
        >
          <button
            onClick={() => void copySummary()}
            className="px-6 py-4 surface-raised rounded-2xl text-sm font-semibold tracking-wide transition-all active:scale-95 shadow-glass inline-flex items-center justify-center gap-2"
          >
            <Copy size={15} />
            Copy Summary
          </button>
          <button
            onClick={printEncounter}
            className="px-6 py-4 surface-raised rounded-2xl text-sm font-semibold tracking-wide transition-all active:scale-95 shadow-glass inline-flex items-center justify-center gap-2"
          >
            <Printer size={15} />
            Print Sheet
          </button>
          <button
            onClick={reset}
            className="px-10 py-4 cta-live rounded-2xl text-sm font-semibold tracking-wide transition-all active:scale-95 shadow-glass"
          >
            New Consultation
          </button>
        </motion.div>
      </div>
    </div>
  );
};
