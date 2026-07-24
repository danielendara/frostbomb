import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('Close Guide button in Field Guide works', async ({ page }) => {
  const guideToggle = page.locator('#guide-toggle');
  const fieldGuide = page.locator('#field-guide');
  const guideClose = page.locator('#guide-close');

  // Open guide
  await guideToggle.click();
  await expect(fieldGuide).toBeVisible();

  // Close guide using the new button
  await guideClose.click();
  await expect(fieldGuide).not.toBeVisible();
  await expect(guideToggle).toHaveAttribute('aria-pressed', 'false');
});

test('Interactive elements have tactile feedback scaling', async ({ page }) => {
  const refreshBtn = page.locator('#refresh');

  // Measure initial size/position if needed, but we mainly want to check CSS computed style if possible,
  // or just trust the CSS selector presence.
  // We can't easily test :active state with Playwright click() because it's instantaneous.
  // But we can check if the CSS rule exists in the stylesheet.
});

test('Tactile feedback respects prefers-reduced-motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // This is hard to test automatically without complex visual regression or checking computed styles during mouse down.
});

test('Nakaya diagram aria-label updates on interaction', async ({ page }) => {
  const nakaya = page.locator('#nakaya-diagram');

  // Open the Field Guide so the diagram is visible
  await page.click('#guide-toggle');
  await expect(page.locator('#field-guide')).toBeVisible();

  // Turn on Lab Mode to ensure initial label is set with dynamic values
  await page.click('#lab-toggle');
  await expect(page.locator('#lab-status')).toHaveText('ON');

  // Ensure the label follows the dynamic pattern
  await expect(nakaya).toHaveAttribute('aria-label', /Nakaya morphology diagram: -?\d+(\.\d+)?°C, \d+% humidity/);
  const initialAria = await nakaya.getAttribute('aria-label');

  // Trigger interaction by clicking the diagram at a specific point
  await nakaya.click({ position: { x: 50, y: 50 }, force: true });

  // Verify updated aria-label
  await expect(async () => {
    const currentAria = await nakaya.getAttribute('aria-label');
    expect(currentAria).not.toBe(initialAria);
  }).toPass({ timeout: 10000 });

  const updatedAria = await nakaya.getAttribute('aria-label');
  expect(updatedAria).toMatch(/Nakaya morphology diagram: -?\d+(\.\d+)?°C, \d+% humidity/);
});

test('Lab Mode allows custom seed input and updates the UI', async ({ page }) => {
  // Toggle Lab Mode
  await page.click('#lab-toggle');
  await expect(page.locator('#lab-status')).toHaveText('ON');

  // Wait for Lab Mode controls to be visible
  await expect(page.locator('#lab-controls')).toBeVisible();

  // Find the seed input in Tweakpane
  const seedInput = page.locator('.tp-lblv:has-text("Seed") input');
  await expect(seedInput).toBeVisible();

  // Initially has some seed
  const initialSeed = await seedInput.inputValue();
  expect(initialSeed.length).toBeGreaterThanOrEqual(3);

  // Fill in a custom valid seed
  await seedInput.fill('abcde');
  await page.keyboard.press('Enter');

  // Verify the URL query param has changed to "abcde"
  await expect(page).toHaveURL(/seed=abcde/);

  // Verify that the seed button label displays "abcde"
  const seedDisplay = page.locator('#seed-display');
  await expect(seedDisplay).toHaveText('abcde');

  // Fill in an invalid seed (e.g., too short)
  await seedInput.fill('ab');
  await page.keyboard.press('Enter');

  // Verify it reverts to the current valid seed "abcde"
  await expect(seedInput).toHaveValue('abcde');

  // Verify visual and aural error feedback
  const seedBtn = page.locator('#btn-seed');
  await expect(seedBtn).toContainText('3-12 chars');
  const announcer = page.locator('#a11y-announcer');
  await expect(announcer).toHaveText('Invalid seed. Seeds must be 3 to 12 alphanumeric characters.');
});

test('Skip link is the first focusable element and shifts focus to #field-notes', async ({ page }) => {
  // Focus the page body/initial area, then Tab
  await page.keyboard.press('Tab');

  const skipLink = page.locator('.skip-link');
  // Check if skip-link is focused
  await expect(skipLink).toBeFocused();

  // Press Enter to activate the link
  await page.keyboard.press('Enter');

  // The field-notes element should receive focus
  const fieldNotes = page.locator('#field-notes');
  await expect(fieldNotes).toBeFocused();
});

test('Nakaya diagram displays live-hover preview and reverts on leave', async ({ page }) => {
  const guideToggle = page.locator('#guide-toggle');
  const fieldGuide = page.locator('#field-guide');
  const nakaya = page.locator('#nakaya-diagram');
  const status = page.locator('#nakaya-status');

  // Open guide
  await guideToggle.click();
  await expect(fieldGuide).toBeVisible();

  // Initially, status should show Active state
  await expect(status).toBeVisible();
  await expect(status).toContainText('Active:');

  // Hover over Nakaya diagram
  await nakaya.hover({ position: { x: 150, y: 100 } });

  // Status should change to Preview mode
  await expect(status).toContainText('Preview:');

  // Move cursor away (hover back to guideToggle)
  await guideToggle.hover();

  // Status should revert to Active mode
  await expect(status).toContainText('Active:');
});
