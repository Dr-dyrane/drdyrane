import { expect, test } from '@playwright/test';
import { seedClinicalStorage } from './helpers/seedSession';
import { installConsultApiMock } from './helpers/mockApi';

test.describe('Consult Room UX Smoke', () => {
  test('handles fast taps without duplicate API turn', async ({ page }) => {
    await seedClinicalStorage(page);
    const apiMock = await installConsultApiMock(page, {
      id: 'fever',
      discriminatorQuestion: 'Are fever episodes cyclical with evening chills and mosquito exposure?',
    });

    await page.goto('/');
    const continueToApp = page.getByRole('button', { name: 'Continue to App' });
    if (await continueToApp.isVisible()) {
      await continueToApp.click();
    }

    const intake = page.getByPlaceholder('Describe your main concern...');
    await intake.fill('fever');
    await intake.press('Enter');

    await expect.poll(() => apiMock.consultCount()).toBe(1);
    const firstOption = page.locator('.option-button').first();
    await expect(firstOption).toBeVisible();
    await firstOption.dblclick();
    await page.waitForTimeout(450);

    await expect.poll(() => apiMock.consultCount()).toBeGreaterThan(1);
    expect(apiMock.consultCount()).toBeLessThanOrEqual(2);
  });

  test('reload mid-consult keeps transcript and current question', async ({ page }) => {
    await seedClinicalStorage(page);
    const apiMock = await installConsultApiMock(page, {
      id: 'fever',
      discriminatorQuestion: 'Are fever episodes cyclical with evening chills and mosquito exposure?',
    });

    await page.goto('/');
    const continueToApp = page.getByRole('button', { name: 'Continue to App' });
    if (await continueToApp.isVisible()) {
      await continueToApp.click();
    }

    const intake = page.getByPlaceholder('Describe your main concern...');
    await intake.fill('fever');
    await intake.press('Enter');

    await expect.poll(() => apiMock.consultCount()).toBe(1);
    const firstOption = page.locator('.option-button').first();
    await expect(firstOption).toBeVisible();
    await firstOption.click();
    await expect.poll(() => apiMock.consultCount()).toBeGreaterThan(1);
    await page.waitForFunction(() => {
      const raw = localStorage.getItem('dr_dyrane.v2.session');
      if (!raw) return false;
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed?.state?.conversation) && parsed.state.conversation.length >= 4;
      } catch {
        return false;
      }
    });

    await page.reload();

    await expect(page.getByText('fever')).toBeVisible();
    const resumedQuestion = page.locator('.consult-chat-bubble-doctor').last();
    await expect(resumedQuestion).toContainText('?');

    const resumedOption = page.locator('.option-button').first();
    await resumedOption.click();
    await expect.poll(() => apiMock.consultCount()).toBeGreaterThan(2);
  });

  test('offline reload keeps cached shell and local session', async ({ page, context }) => {
    await seedClinicalStorage(page);
    await installConsultApiMock(page, {
      id: 'fever',
      discriminatorQuestion: 'Are fever episodes cyclical with evening chills and mosquito exposure?',
    });

    await page.goto('/');
    const continueToApp = page.getByRole('button', { name: 'Continue to App' });
    if (await continueToApp.isVisible()) {
      await continueToApp.click();
    }

    await page.waitForFunction(() => 'serviceWorker' in navigator);
    await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      await navigator.serviceWorker.ready;
      return true;
    });

    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(page.getByLabel('Open Consult')).toBeVisible();
    await expect(page.getByPlaceholder('Describe your main concern...')).toBeVisible();

    const hasSession = await page.evaluate(() => Boolean(localStorage.getItem('dr_dyrane.v2.session')));
    expect(hasSession).toBeTruthy();

    await context.setOffline(false);
  });
});
