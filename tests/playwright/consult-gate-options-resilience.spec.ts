import { expect, test } from '@playwright/test';
import { seedClinicalStorage } from './helpers/seedSession';

const SESSION_KEY = 'dr_dyrane.v2.session';

test.describe('Consult Gate Option Resilience', () => {
  test('uses timed yes/no options when persisted gate options are stale', async ({ page }) => {
    await seedClinicalStorage(page);

    await page.addInitScript(() => {
      const raw = localStorage.getItem('dr_dyrane.v2.session');
      if (!raw) return;

      try {
        const envelope = JSON.parse(raw);
        const now = Date.now();
        const timedPrompt =
          'Do episodes start with evening chills, rise at night, then ease by morning?';

        envelope.savedAt = now;
        envelope.revision = Number(envelope.revision || 1) + 1;
        envelope.state.status = 'active';
        envelope.state.view = 'consult';
        envelope.state.conversation = [
          {
            id: `patient-${now - 2}`,
            role: 'patient',
            content: 'fever with chills and weakness',
            timestamp: now - 2,
          },
          {
            id: `doctor-${now - 1}`,
            role: 'doctor',
            content: timedPrompt,
            timestamp: now - 1,
            metadata: {
              question: timedPrompt,
              statement: 'Noted.',
            },
          },
        ];
        envelope.state.question_gate = {
          active: true,
          kind: 'stacked_symptom',
          source_question: 'Which symptom cluster stands out most right now?',
          segments: [
            { id: 'dominant_cluster', prompt: 'Which symptom cluster stands out most right now?' },
            { id: 'cluster_detail_fever', prompt: 'Within fever pattern, which cue stands out most?' },
            { id: 'fever_cycle_pattern', prompt: timedPrompt, timeout_seconds: 10 },
            {
              id: 'mosquito_exposure',
              prompt: 'Any recent mosquito exposure or sleeping without mosquito protection?',
              timeout_seconds: 10,
            },
          ],
          current_index: 2,
          answers: [
            {
              segment_id: 'dominant_cluster',
              prompt: 'Which symptom cluster stands out most right now?',
              response: 'Fever pattern',
            },
            {
              segment_id: 'cluster_detail_fever',
              prompt: 'Within fever pattern, which cue stands out most?',
              response: 'Evening chills',
            },
          ],
        };

        // Intentionally stale and wrong for timed yes/no segment.
        envelope.state.response_options = {
          mode: 'single',
          ui_variant: 'stack',
          options: [
            { id: 'onset-today', text: 'Started today' },
            { id: 'onset-1-2d', text: '1-2 days ago' },
            { id: 'onset-3-4d', text: '3-4 days ago' },
            { id: 'onset-5-7d', text: '5-7 days ago' },
          ],
          allow_custom_input: true,
          context_hint: 'Choose the nearest count range.',
        };
        envelope.state.selected_options = [];

        localStorage.setItem('dr_dyrane.v2.session', JSON.stringify(envelope));
      } catch {
        localStorage.removeItem('dr_dyrane.v2.session');
      }
    });

    await page.goto('/');
    const continueToApp = page.getByRole('button', { name: 'Continue to App' });
    if (await continueToApp.isVisible()) {
      await continueToApp.click();
    }

    await expect(
      page.getByText('Do episodes start with evening chills, rise at night, then ease by morning?')
    ).toBeVisible();

    await expect(page.locator('.option-button', { hasText: 'Yes' }).first()).toBeVisible();
    await expect(page.locator('.option-button', { hasText: 'No' }).first()).toBeVisible();
    await expect(page.locator('.option-button', { hasText: 'Started today' })).toHaveCount(0);

    const isStillStaleInStorage = await page.evaluate((sessionKey) => {
      const raw = localStorage.getItem(sessionKey);
      if (!raw) return false;
      try {
        const envelope = JSON.parse(raw);
        const options = envelope?.state?.response_options?.options || [];
        return options.some((entry: { text?: string }) => (entry?.text || '') === 'Started today');
      } catch {
        return false;
      }
    }, SESSION_KEY);
    expect(isStillStaleInStorage).toBeTruthy();
  });

  test('infers binary intent from prefaced question text and corrects stale timeline options', async ({
    page,
  }) => {
    await seedClinicalStorage(page);

    await page.addInitScript(() => {
      const raw = localStorage.getItem('dr_dyrane.v2.session');
      if (!raw) return;

      try {
        const envelope = JSON.parse(raw);
        const now = Date.now();
        const prefacedQuestion =
          'Noted. Do episodes start with evening chills, rise at night, then ease by morning?';

        envelope.savedAt = now;
        envelope.revision = Number(envelope.revision || 1) + 1;
        envelope.state.status = 'active';
        envelope.state.view = 'consult';
        envelope.state.conversation = [
          {
            id: `patient-${now - 2}`,
            role: 'patient',
            content: 'fever with chills and weakness',
            timestamp: now - 2,
          },
          {
            id: `doctor-${now - 1}`,
            role: 'doctor',
            content: prefacedQuestion,
            timestamp: now - 1,
          },
        ];
        envelope.state.question_gate = {
          active: true,
          kind: 'stacked_symptom',
          source_question: 'Which symptom cluster stands out most right now?',
          segments: [
            {
              id: 'fever_cycle_pattern',
              prompt: 'Do episodes start with evening chills, rise at night, then ease by morning?',
            },
          ],
          current_index: 0,
          answers: [],
        };
        envelope.state.response_options = {
          mode: 'single',
          ui_variant: 'stack',
          options: [
            { id: 'onset-today', text: 'Started today' },
            { id: 'onset-1-2d', text: '1-2 days ago' },
            { id: 'onset-3-4d', text: '3-4 days ago' },
            { id: 'onset-5-7d', text: '5-7 days ago' },
          ],
          allow_custom_input: true,
          context_hint: 'Choose when symptoms began.',
        };
        envelope.state.selected_options = [];

        localStorage.setItem('dr_dyrane.v2.session', JSON.stringify(envelope));
      } catch {
        localStorage.removeItem('dr_dyrane.v2.session');
      }
    });

    await page.goto('/');
    const continueToApp = page.getByRole('button', { name: 'Continue to App' });
    if (await continueToApp.isVisible()) {
      await continueToApp.click();
    }

    await expect(
      page.getByText('Noted. Do episodes start with evening chills, rise at night, then ease by morning?')
    ).toBeVisible();
    await expect(page.locator('.option-button', { hasText: 'Yes' }).first()).toBeVisible();
    await expect(page.locator('.option-button', { hasText: 'No' }).first()).toBeVisible();
    await expect(page.locator('.option-button', { hasText: 'Started today' })).toHaveCount(0);
  });
});
