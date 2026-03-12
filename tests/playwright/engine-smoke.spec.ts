import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { seedClinicalStorage } from './helpers/seedSession';
import { installConsultApiMock } from './helpers/mockApi';

const encounterSpecPath = path.resolve(process.cwd(), 'scripts/specs/encounter-matrix.json');
const encounterSpec = JSON.parse(fs.readFileSync(encounterSpecPath, 'utf8')) as {
  engines: Array<{
    id: string;
    starter_input: string;
    discriminator_question: string;
  }>;
};

test.describe('Consult Engine UI Smoke', () => {
  for (const engine of encounterSpec.engines) {
    test(`${engine.id} chat-first + assistive options`, async ({ page }) => {
      await seedClinicalStorage(page);
      const apiMock = await installConsultApiMock(page, {
        id: engine.id,
        discriminatorQuestion: engine.discriminator_question,
      });

      await page.goto('/');
      const continueToApp = page.getByRole('button', { name: 'Continue to App' });
      if (await continueToApp.isVisible()) {
        await continueToApp.click();
      }

      const intake = page.getByPlaceholder('Describe your main concern...');
      await intake.fill(engine.starter_input);
      await intake.press('Enter');

      await expect.poll(() => apiMock.consultCount()).toBeGreaterThan(0);
      const doctorBubble = page.locator('.consult-chat-bubble-doctor').last();
      await expect(doctorBubble).toContainText('?');

      const emergencyOverlayCta = page.getByText('Go to the nearest emergency department now.');
      if (await emergencyOverlayCta.isVisible()) {
        await expect(apiMock.consultCount()).toBeGreaterThan(0);
        return;
      }

      const firstOption = page.locator('.option-button').first();
      await expect(firstOption).toBeVisible();
      await firstOption.click();
      await expect.poll(() => apiMock.consultCount()).toBeGreaterThan(1);

      const followupBubble = page.locator('.consult-chat-bubble-doctor').last();
      await expect(followupBubble).toContainText('?');
    });
  }
});
