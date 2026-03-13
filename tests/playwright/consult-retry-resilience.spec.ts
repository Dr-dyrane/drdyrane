import { expect, test } from '@playwright/test';
import { seedClinicalStorage } from './helpers/seedSession';

test.describe('Consult Retry Resilience', () => {
  test('falls back gracefully on first consult failure and continues next turn', async ({ page }) => {
    await seedClinicalStorage(page);

    let consultCallCount = 0;

    await page.route('**/api/consult', async (route) => {
      consultCallCount += 1;

      if (consultCallCount === 1) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Synthetic timeout' }),
        });
        return;
      }

      const requestBody = route.request().postDataJSON() as { patientInput?: string };
      const patientInput = String(requestBody?.patientInput || '');

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          statement: 'Noted. Thank you for the details.',
          question: 'How long has this complaint been present?',
          soap_updates: {
            S: {
              chief_complaint: 'fever',
              last_input: patientInput,
            },
          },
          ddx: ['Undifferentiated febrile illness (ICD-10: R50.9)'],
          agent_state: {
            phase: 'assessment',
            confidence: 62,
            focus_area: 'Fever intake',
            pending_actions: ['Capture duration', 'Check danger signs'],
            last_decision: 'Recovered after retry',
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
          thinking: 'Retry recovery path',
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
            { id: 'onset-today', text: 'Started today' },
            { id: 'onset-1-2', text: '1-2 days ago' },
            { id: 'onset-3-4', text: '3-4 days ago' },
            { id: 'onset-5-7', text: '5-7 days ago' },
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
    await intake.fill('fever with chills and weakness');
    await intake.press('Enter');

    await expect(
      page.getByText('Thank you. I am still with you.', { exact: false })
    ).toBeVisible();
    await expect(page.getByText('What symptom is bothering you most right now?')).toBeVisible();

    const chatInput = page.getByPlaceholder('Type your response...');
    await expect(chatInput).toBeVisible();
    await chatInput.fill('fever');
    await chatInput.press('Enter');

    await expect
      .poll(() => consultCallCount, {
        timeout: 5000,
      })
      .toBe(2);

    await expect(page.getByText('How long has this complaint been present?')).toBeVisible();
    await expect(page.locator('.option-button').first()).toBeVisible();
  });
});
