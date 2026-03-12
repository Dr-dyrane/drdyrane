import React from 'react';
import { motion } from 'framer-motion';
import { useClinical } from '../../core/context/ClinicalContext';
import { Activity, Printer, Shield, TrendingUp, UserCheck } from 'lucide-react';
import { Orb } from '../consultation/Orb';

export const PillarCard: React.FC = () => {
  const { state, dispatch } = useClinical();

  if (state.status !== 'complete' || !state.pillars) return null;

  const encounter = state.pillars.encounter;
  const pillars = [
    { title: 'Diagnosis', icon: Activity, content: state.pillars.diagnosis },
    ...(encounter ? [] : [{ title: 'Management', icon: Shield, content: state.pillars.management }]),
    { title: 'Prognosis', icon: TrendingUp, content: state.pillars.prognosis },
    { title: 'Prevention', icon: UserCheck, content: state.pillars.prevention },
  ];

  const escapeHtml = (value: string): string =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const printEncounter = () => {
    if (!state.pillars) return;
    const plan = state.pillars;
    const investigations = (plan.encounter?.investigations || [])
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join('');
    const prescriptions = (plan.encounter?.prescriptions || [])
      .map(
        (item) =>
          `<tr>
            <td>${escapeHtml(item.medication)}</td>
            <td>${escapeHtml(item.form)}</td>
            <td>${escapeHtml(item.dose)}</td>
            <td>${escapeHtml(item.frequency)}</td>
            <td>${escapeHtml(item.duration)}</td>
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
          body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif; padding: 24px; color: #111; }
          h1 { font-size: 22px; margin: 0 0 8px; }
          h2 { font-size: 15px; margin: 16px 0 8px; }
          p { line-height: 1.45; white-space: pre-line; margin: 0; }
          ul { margin: 0; padding-left: 18px; line-height: 1.4; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
          th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #e5e7eb; }
          .chip { display: inline-block; padding: 4px 8px; border-radius: 999px; background: #f4f4f5; font-size: 11px; margin-bottom: 8px; }
        </style>
      </head>
      <body>
        <h1>Dr Dyrane Clinical Encounter</h1>
        <div class="chip">Prescription-ready summary</div>
        <h2>Diagnosis</h2>
        <p>${escapeHtml(plan.diagnosis)}</p>
        <h2>Management</h2>
        <p>${escapeHtml(plan.management)}</p>
        ${
          investigations
            ? `<h2>Investigations</h2><ul>${investigations}</ul>`
            : ''
        }
        ${
          prescriptions
            ? `<h2>Prescription</h2>
              <table>
                <thead><tr><th>Medication</th><th>Form</th><th>Dose</th><th>Frequency</th><th>Duration</th></tr></thead>
                <tbody>${prescriptions}</tbody>
              </table>`
            : ''
        }
        ${
          counseling
            ? `<h2>Pharmacy Counseling</h2><ul>${counseling}</ul>`
            : ''
        }
        ${
          followUp
            ? `<h2>Follow-Up</h2><ul>${followUp}</ul>`
            : ''
        }
        <h2>Prognosis</h2>
        <p>${escapeHtml(plan.prognosis)}</p>
        <h2>Prevention</h2>
        <p>${escapeHtml(plan.prevention)}</p>
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
                <div className="space-y-2">
                  {encounter.prescriptions.map((item, index) => (
                    <div key={`rx-${item.medication}-${index}`} className="surface-raised rounded-2xl px-3.5 py-3">
                      <p className="text-sm font-semibold text-content-primary">
                        {item.medication} <span className="text-content-dim font-normal">({item.form})</span>
                      </p>
                      <p className="text-xs text-content-secondary mt-1">
                        {item.dose} • {item.frequency} • {item.duration}
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
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-8"
        >
          <button
            onClick={printEncounter}
            className="px-6 py-4 surface-raised rounded-2xl text-sm font-semibold tracking-wide transition-all active:scale-95 shadow-glass inline-flex items-center justify-center gap-2"
          >
            <Printer size={15} />
            Print Prescription
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
