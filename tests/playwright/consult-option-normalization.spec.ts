import { expect, test } from '@playwright/test';
import { seedClinicalStorage } from './helpers/seedSession';

test.describe('Consult Option Normalization', () => {
  test('maps semantic summary option IDs to stable consult input text', async ({ page }) => {
    await seedClinicalStorage(page);

    await page.addInitScript(() => {
      const raw = localStorage.getItem('dr_dyrane.v2.session');
      if (!raw) return;
      try {
        const envelope = JSON.parse(raw);
        const now = Date.now();
        const summaryQuestion =
          'What other detail should I clarify before I summarize your working diagnosis?';

        envelope.savedAt = now;
        envelope.revision = Number(envelope.revision || 1) + 1;
        envelope.state.status = 'active';
        envelope.state.view = 'consult';
        envelope.state.conversation = [
          {
            id: `patient-${now - 2}`,
            role: 'patient',
            content: 'fever for 2 days',
            timestamp: now - 2,
          },
          {
            id: `doctor-${now - 1}`,
            role: 'doctor',
            content: summaryQuestion,
            timestamp: now - 1,
            metadata: {
              question: summaryQuestion,
              statement: 'I can summarize now.',
            },
          },
        ];
        envelope.state.response_options = {
          mode: 'single',
          ui_variant: 'segmented',
          options: [
            { id: 'summary-ready', text: 'Ready for summary', category: 'summary' },
            { id: 'summary-add-detail', text: 'Add one detail', category: 'summary' },
            { id: 'summary-not-sure', text: 'Not sure', category: 'summary' },
          ],
          allow_custom_input: true,
          context_hint: 'Choose to summarize now or add one last detail.',
        };

        localStorage.setItem('dr_dyrane.v2.session', JSON.stringify(envelope));
      } catch {
        localStorage.removeItem('dr_dyrane.v2.session');
      }
    });

    let capturedPatientInput = '';

    await page.route('**/api/consult', async (route) => {
      const body = route.request().postDataJSON() as { patientInput?: string };
      capturedPatientInput = String(body?.patientInput || '');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          statement: 'Summary acknowledged.',
          question: 'Any danger signs now: breathlessness, confusion, chest pain, persistent vomiting, or bleeding?',
          soap_updates: { S: { chief_complaint: 'fever' } },
          ddx: ['Malaria (ICD-10: B54)'],
          agent_state: {
            phase: 'resolution',
            confidence: 88,
            focus_area: 'summary',
            pending_actions: ['Safety check'],
            last_decision: 'summary path',
            positive_findings: ['fever'],
            negative_findings: [],
            must_not_miss_checkpoint: {
              required: true,
              status: 'pending',
              last_question:
                'Any danger signs now: breathlessness, confusion, chest pain, persistent vomiting, or bleeding?',
              last_response: capturedPatientInput,
              updated_at: Date.now(),
            },
          },
          urgency: 'medium',
          probability: 88,
          thinking: 'summary handoff',
          needs_options: true,
          lens_trigger: null,
          status: 'active',
        }),
      });
    });

    await page.route('**/api/options', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          mode: 'single',
          ui_variant: 'segmented',
          options: [
            { id: 'none', text: 'None of these' },
            { id: 'yes', text: 'Yes' },
            { id: 'unsure', text: 'Not sure' },
          ],
          allow_custom_input: true,
        }),
      });
    });

    await page.goto('/');
    const continueToApp = page.getByRole('button', { name: 'Continue to App' });
    if (await continueToApp.isVisible()) {
      await continueToApp.click();
    }

    await expect(
      page.getByText('What other detail should I clarify before I summarize your working diagnosis?')
    ).toBeVisible();
    await page.locator('.option-button', { hasText: 'Ready for summary' }).first().click();

    await expect.poll(() => capturedPatientInput).toBe('Ready for summary');
    await expect(page.getByText('Any danger signs now: breathlessness, confusion, chest pain, persistent vomiting, or bleeding?')).toBeVisible();
  });
});
