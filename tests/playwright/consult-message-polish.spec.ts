import { expect, test } from '@playwright/test';
import { seedClinicalStorage } from './helpers/seedSession';

test.describe('Consult Message Polish', () => {
  test('suppresses filler doctor statements when question is present', async ({ page }) => {
    await seedClinicalStorage(page);

    await page.route('**/api/consult', async (route) => {
      const requestBody = route.request().postDataJSON() as { patientInput?: string };
      const patientInput = String(requestBody?.patientInput || '');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          statement: 'Noted.',
          question: 'How long has this complaint been present?',
          soap_updates: { S: { chief_complaint: patientInput || 'fever' } },
          ddx: ['Viral febrile illness (ICD-10: R50.9)'],
          agent_state: {
            phase: 'assessment',
            confidence: 62,
            focus_area: 'onset',
            pending_actions: ['Capture duration'],
            last_decision: 'Duration focus',
            positive_findings: ['fever'],
            negative_findings: [],
            must_not_miss_checkpoint: {
              required: false,
              status: 'idle',
              last_question: 'How long has this complaint been present?',
              last_response: patientInput,
              updated_at: Date.now(),
            },
          },
          urgency: 'low',
          probability: 62,
          thinking: 'onset clarification',
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
          ui_variant: 'stack',
          options: [
            { id: 'today', text: 'Started today' },
            { id: 'd1-2', text: '1-2 days ago' },
            { id: 'd3-4', text: '3-4 days ago' },
            { id: 'd5-7', text: '5-7 days ago' },
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

    const intake = page.getByPlaceholder('Describe your main concern...');
    await intake.fill('fever');
    await intake.press('Enter');

    await expect(page.getByText('How long has this complaint been present?')).toBeVisible();

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const raw = localStorage.getItem('dr_dyrane.v2.session');
            if (!raw) return '';
            try {
              const parsed = JSON.parse(raw);
              const conversation = Array.isArray(parsed?.state?.conversation)
                ? parsed.state.conversation
                : [];
              const lastDoctor = [...conversation].reverse().find((entry) => entry?.role === 'doctor');
              return String(lastDoctor?.content || '');
            } catch {
              return '';
            }
          }),
        { timeout: 6000 }
      )
      .toContain('How long has this complaint been present?');

    const latestDoctorMessage = await page.evaluate(() => {
      const raw = localStorage.getItem('dr_dyrane.v2.session');
      if (!raw) return '';
      try {
        const parsed = JSON.parse(raw);
        const conversation = Array.isArray(parsed?.state?.conversation) ? parsed.state.conversation : [];
        const lastDoctor = [...conversation].reverse().find((entry) => entry?.role === 'doctor');
        return String(lastDoctor?.content || '');
      } catch {
        return '';
      }
    });
    expect(/^noted\.?\s/i.test(latestDoctorMessage)).toBeFalsy();
  });
});
