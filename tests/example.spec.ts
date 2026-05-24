import { expect, test } from '@playwright/test';

test('can click and verify page state', async ({ page }) => {
  await page.setContent(`
    <main>
      <h1>Playwright ready</h1>
      <button type="button" id="counter">Clicked 0 times</button>
      <script>
        let count = 0;
        document.querySelector('#counter').addEventListener('click', event => {
          count += 1;
          event.currentTarget.textContent = 'Clicked ' + count + ' time';
        });
      </script>
    </main>
  `);

  await expect(page.getByRole('heading', { name: 'Playwright ready' })).toBeVisible();
  await page.getByRole('button', { name: 'Clicked 0 times' }).click();
  await expect(page.getByRole('button', { name: 'Clicked 1 time' })).toBeVisible();
});
