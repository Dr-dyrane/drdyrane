import { expect, test } from '@playwright/test';
import { seedClinicalStorage } from './helpers/seedSession';

test.describe('Consult Gate Reload Persistence', () => {
  test('keeps active non-safety question gate across reload when persisted state is valid', async ({
    page,
  }) => {
    await seedClinicalStorage(page);

    await page.addInitScript(() => {
      const raw = localStorage.getItem('dr_dyrane.v2.session');
      if (!raw) return;
      try {
        const envelope = JSON.parse(raw);
        const now = Date.now();
        const gateQuestion =
          'Do episodes start with evening chills, rise at night, then ease by morning?';

        envelope.savedAt = now;
        envelope.revision = Number(envelope.revision || 1) + 1;
        envelope.state.status = 'active';
        envelope.state.view = 'consult';
        envelope.state.conversation = [
          {
            id: `patient-${now - 2}`,
            role: 'patient',
            content: 'fever with evening chills',
            timestamp: now - 2,
          },
          {
            id: `doctor-${now - 1}`,
            role: 'doctor',
            content: gateQuestion,
            timestamp: now - 1,
            metadata: {
              statement: 'Noted.',
              question: gateQuestion,
            },
          },
        ];
        envelope.state.question_gate = {
          active: true,
          kind: 'stacked_symptom',
          source_question: 'Which symptom cluster stands out most right now?',
          segments: [
            {
              id: 'dominant_cluster',
              prompt: 'Which symptom cluster stands out most right now?',
            },
            {
              id: 'fever_cycle_pattern',
              prompt: gateQuestion,
              timeout_seconds: 10,
            },
          ],
          current_index: 1,
          answers: [
            {
              segment_id: 'dominant_cluster',
              prompt: 'Which symptom cluster stands out most right now?',
              response: 'Fever pattern',
            },
          ],
        };
        envelope.state.response_options = {
          mode: 'single',
          ui_variant: 'segmented',
          options: [
            { id: 'yes', text: 'Yes' },
            { id: 'no', text: 'No' },
            { id: 'unsure', text: 'Not sure' },
          ],
          allow_custom_input: true,
          context_hint: 'Step 2 of 2: Quick yes/no.',
        };
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

    await page.reload();

    await expect(
      page.getByText('Do episodes start with evening chills, rise at night, then ease by morning?')
    ).toBeVisible();
    await expect(page.locator('.option-button', { hasText: 'Yes' }).first()).toBeVisible();
  });
});
