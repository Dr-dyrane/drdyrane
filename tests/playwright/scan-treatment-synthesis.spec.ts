import { expect, test, type Page } from '@playwright/test';
import { seedClinicalStorage } from './helpers/seedSession';

const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6S8f8AAAAASUVORK5CYII=';

const dismissLaunchSpotlightIfPresent = async (page: Page) => {
  const continueToApp = page.getByRole('button', { name: /Continue to App/i });
  if (await continueToApp.isVisible().catch(() => false)) {
    await continueToApp.click();
    return;
  }
  const closeSpotlight = page.getByRole('button', { name: /Close spotlight/i });
  if (await closeSpotlight.isVisible().catch(() => false)) {
    await closeSpotlight.click();
  }
};

const recoverFromEmergencyOverlayIfPresent = async (page: Page) => {
  const emergencyTitle = page.getByRole('heading', { name: /Emergency/i });
  if (!(await emergencyTitle.isVisible().catch(() => false))) return;
  await page.evaluate(() => {
    const key = 'dr_dyrane.v2.session';
    const raw = localStorage.getItem(key);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { state?: Record<string, unknown> } & Record<string, unknown>;
      const state = (parsed.state && typeof parsed.state === 'object'
        ? parsed.state
        : parsed) as Record<string, unknown>;
      state.status = 'idle';
      state.redFlag = false;
      state.urgency = 'low';
      state.probability = 0;
      if (parsed.state && typeof parsed.state === 'object') {
        parsed.state = state;
        localStorage.setItem(key, JSON.stringify(parsed));
        return;
      }
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      localStorage.removeItem(key);
    }
  });
  await page.reload();
};

test.describe('Scan Treatment Synthesis', () => {
  test('keeps vision call intact and enriches treatment via second scan-plan call', async ({ page }) => {
    await seedClinicalStorage(page);

    let visionCalls = 0;
    let scanPlanCalls = 0;

    await page.route('**/api/vision', async (route) => {
      visionCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          summary: 'Intermittent febrile pattern with no immediate visual red flags.',
          findings: ['no focal skin lesion', 'general fatigued appearance'],
          red_flags: [],
          confidence: 0.79,
          recommendation: 'Correlate with fever timeline and exposure history.',
          spot_diagnosis: {
            label: 'Provisional febrile illness',
            confidence: 0.62,
          },
          differentials: [],
          treatment_lines: [],
          investigations: [],
          counseling: [],
        }),
      });
    });

    await page.route('**/api/scan-plan', async (route) => {
      scanPlanCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          spot_diagnosis: {
            label: 'Uncomplicated malaria',
            icd10: 'B54',
            confidence: 0.89,
            rationale: 'Fever pattern and exposure profile are highly suggestive.',
          },
          differentials: [
            {
              label: 'Typhoid fever',
              icd10: 'A01.0',
              likelihood: 'medium',
            },
          ],
          treatment_summary: 'Definitive antimalarial treatment pathway',
          treatment_lines: [
            'Start ACT now (weight-adjusted per protocol).',
            'Use paracetamol for fever symptom control.',
          ],
          investigations: ['Malaria RDT', 'Thick and thin blood film'],
          counseling: ['Complete full antimalarial course.'],
          red_flags: ['Persistent vomiting', 'Confusion'],
          recommendation: 'Begin treatment and reassess within 24-48 hours.',
        }),
      });
    });

    await page.goto('/');
    await dismissLaunchSpotlightIfPresent(page);
    await recoverFromEmergencyOverlayIfPresent(page);
    await dismissLaunchSpotlightIfPresent(page);
    await page.addStyleTag({ content: '.z-\\[270\\].overlay-backdrop-strong{display:none !important;}' });

    await page.getByRole('button', { name: 'Open Scan' }).click();

    const fileInput = page.locator('input[type="file"][accept="image/*"]').first();
    await fileInput.setInputFiles({
      name: 'scan-image.png',
      mimeType: 'image/png',
      buffer: Buffer.from(ONE_PIXEL_PNG_BASE64, 'base64'),
    });

    await page.getByRole('button', { name: /Dr Review|AI Review/i }).click({ force: true });

    await expect
      .poll(() => visionCalls, { timeout: 6000 })
      .toBeGreaterThan(0);
    await expect
      .poll(() => scanPlanCalls, { timeout: 6000 })
      .toBeGreaterThan(0);

    await expect(page.getByText('Review Output')).toBeVisible();
    await expect(page.getByText('Definitive antimalarial treatment pathway')).toBeVisible();
    await expect(page.getByText('Start ACT now (weight-adjusted per protocol).')).toBeVisible();
    await expect(page.getByText('Malaria RDT')).toBeVisible();
  });
});
