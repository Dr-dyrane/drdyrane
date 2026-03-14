import { expect, test } from '@playwright/test';
import { seedClinicalStorage } from './helpers/seedSession';

const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6S8f8AAAAASUVORK5CYII=';

test.describe('Consult Media Intake', () => {
  test('uploads image in consult, runs vision review, and injects visual context into consult flow', async ({
    page,
  }) => {
    await seedClinicalStorage(page);

    let visionCalls = 0;
    let consultCalls = 0;
    const consultInputs: string[] = [];

    await page.route('**/api/vision', async (route) => {
      visionCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          summary: 'Multiple oral ulcers on lower lip mucosa.',
          findings: ['round white ulcers', 'erythematous borders'],
          red_flags: [],
          confidence: 0.91,
          recommendation: 'Correlate with oral pain timeline and systemic symptoms.',
          spot_diagnosis: {
            label: 'Likely recurrent aphthous stomatitis (provisional)',
            icd10: 'K12.0',
            confidence: 0.86,
          },
          differentials: [
            { label: 'Herpetic stomatitis', icd10: 'B00.2', likelihood: 'medium' },
            { label: 'Traumatic oral ulcer', likelihood: 'low' },
          ],
        }),
      });
    });

    await page.route('**/api/consult', async (route) => {
      consultCalls += 1;
      const requestBody = route.request().postDataJSON() as { patientInput?: string };
      const patientInput = String(requestBody?.patientInput || '');
      consultInputs.push(patientInput);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          statement: 'I reviewed your uploaded image and integrated it into your assessment.',
          question: 'How long have these mouth lesions been present?',
          soap_updates: {
            S: {
              chief_complaint: 'oral lesions',
              visual_context_ingested: true,
            },
          },
          ddx: ['Aphthous stomatitis (ICD-10: K12.0)', 'Herpetic stomatitis (ICD-10: B00.2)'],
          agent_state: {
            phase: 'assessment',
            confidence: 84,
            focus_area: 'Oral lesion history',
            pending_actions: ['Capture duration', 'Screen danger signs'],
            last_decision: 'Integrated visual morphology into consult thread',
            positive_findings: ['oral ulcers'],
            negative_findings: [],
            must_not_miss_checkpoint: {
              required: false,
              status: 'idle',
              last_question: 'How long have these mouth lesions been present?',
              last_response: patientInput,
              updated_at: Date.now(),
            },
          },
          urgency: 'low',
          probability: 84,
          thinking: 'Visual-to-consult handoff successful.',
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

    const imageInput = page.getByTestId('consult-image-input');
    await expect(imageInput).toHaveCount(1);
    await imageInput.setInputFiles({
      name: 'oral-lesion.png',
      mimeType: 'image/png',
      buffer: Buffer.from(ONE_PIXEL_PNG_BASE64, 'base64'),
    });

    await expect
      .poll(() => visionCalls, {
        timeout: 6000,
      })
      .toBe(1);
    await expect
      .poll(() => consultCalls, {
        timeout: 6000,
      })
      .toBe(1);

    expect(consultInputs[0]).toContain('Visual analysis summary:');
    expect(consultInputs[0]).toContain('Likely recurrent aphthous stomatitis');
    await expect(page.getByText('How long have these mouth lesions been present?')).toBeVisible();
    await expect(page.locator('.option-button').first()).toBeVisible();

    await page.getByRole('button', { name: 'Open Scan' }).click();
    await expect(page.getByText('Review Output')).toBeVisible();
    await expect(
      page.getByText(/Likely recurrent aphthous stomatitis \(provisional\)/).first()
    ).toBeVisible();
  });
});
