import { expect, test } from '@playwright/test';
import { seedClinicalStorage } from './helpers/seedSession';

test.describe('Consult Reset Race Resilience', () => {
  test('ignores delayed pre-reset response and stays in clean intake state', async ({ page }) => {
    await seedClinicalStorage(page);

    await page.addInitScript(() => {
      const raw = localStorage.getItem('dr_dyrane.v2.session');
      if (!raw) return;
      try {
        const envelope = JSON.parse(raw);
        const now = Date.now();
        const question = 'Any danger signs now: breathlessness, confusion, chest pain, persistent vomiting, or bleeding?';

        envelope.savedAt = now;
        envelope.revision = Number(envelope.revision || 1) + 1;
        envelope.state.status = 'active';
        envelope.state.view = 'consult';
        envelope.state.conversation = [
          {
            id: `patient-${now - 2}`,
            role: 'patient',
            content: 'fever with chills',
            timestamp: now - 2,
          },
          {
            id: `doctor-${now - 1}`,
            role: 'doctor',
            content: question,
            timestamp: now - 1,
            metadata: {
              statement: 'I need one safety check.',
              question,
            },
          },
        ];
        envelope.state.response_options = {
          mode: 'single',
          ui_variant: 'segmented',
          options: [
            { id: 'yes', text: 'Yes' },
            { id: 'no', text: 'None of these' },
            { id: 'unsure', text: 'Not sure' },
          ],
          allow_custom_input: true,
        };
        localStorage.setItem('dr_dyrane.v2.session', JSON.stringify(envelope));
      } catch {
        localStorage.removeItem('dr_dyrane.v2.session');
      }
    });

    let consultCalls = 0;
    await page.route('**/api/consult', async (route) => {
      consultCalls += 1;
      const requestBody = route.request().postDataJSON() as { patientInput?: string };
      const patientInput = String(requestBody?.patientInput || '');
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          statement: 'Delayed response arrived.',
          question: 'This delayed question should be ignored after reset?',
          soap_updates: { S: { chief_complaint: 'fever', delayed_input: patientInput } },
          ddx: ['Malaria (ICD-10: B54)'],
          agent_state: {
            phase: 'differential',
            confidence: 82,
            focus_area: 'Delayed mock',
            pending_actions: ['Continue differential'],
            last_decision: 'delayed turn',
            positive_findings: ['fever'],
            negative_findings: [],
            must_not_miss_checkpoint: {
              required: false,
              status: 'idle',
              last_question: 'This delayed question should be ignored after reset?',
              last_response: patientInput,
              updated_at: Date.now(),
            },
          },
          urgency: 'medium',
          probability: 82,
          thinking: 'Delayed response test',
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
            { id: 'yes', text: 'Yes' },
            { id: 'no', text: 'No' },
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
      page.getByText('Any danger signs now: breathlessness, confusion, chest pain, persistent vomiting, or bleeding?')
    ).toBeVisible();
    await page.locator('.option-button', { hasText: 'None of these' }).first().click();

    await expect.poll(() => consultCalls).toBe(1);
    await page.getByLabel('Open contextual actions').click();
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(page.getByPlaceholder('Describe your main concern...')).toBeVisible();

    await page.waitForTimeout(1400);
    await expect(page.getByText('This delayed question should be ignored after reset?')).toHaveCount(0);
    await expect(page.getByPlaceholder('Describe your main concern...')).toBeVisible();

    const snapshot = await page.evaluate(() => {
      const raw = localStorage.getItem('dr_dyrane.v2.session');
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        return {
          status: parsed?.state?.status,
          conversationLength: Array.isArray(parsed?.state?.conversation)
            ? parsed.state.conversation.length
            : -1,
        };
      } catch {
        return null;
      }
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot?.status).toBe('idle');
    expect(snapshot?.conversationLength).toBe(0);
  });
});
