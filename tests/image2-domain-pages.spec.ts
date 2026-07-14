import { expect, test, type Page } from '@playwright/test';

const image2Base = (process.env.IMAGE2_PUBLIC_BASE_URL ?? 'https://image2.lsb0713.online').replace(/\/+$/, '');
const sceneBase = (process.env.IMAGE2_SCENE_BASE_URL ?? 'https://scene.lsb0713.online').replace(/\/+$/, '');
const pictureBase = (process.env.PICTURE_STUDIO_BASE_URL ?? 'https://picture.lsb0713.online').replace(/\/+$/, '');
const pictureHostHeader = process.env.PICTURE_STUDIO_HOST_HEADER;

type PageCheck = {
  name: string;
  path: string;
  required: RegExp[];
  forbidden?: RegExp[];
  expectedFinalPath?: string;
};

const image2Pages: PageCheck[] = [
  {
    name: 'image2 home',
    path: '/',
    required: [/Image2\s*案例库|Image2\s*案例灵感库|Prompt Atlas/],
    forbidden: [/场景引擎/, /白底商品图/, /场景配方库/]
  },
  {
    name: 'image2 case library',
    path: '/image2-cases',
    required: [/Image2\s*案例灵感库|从爆款图到可复刻提示词/],
    forbidden: [/场景引擎/, /白底商品图/, /场景配方库/]
  },
  {
    name: 'image2 workbench',
    path: '/workbench',
    required: [/Image2\s*作图中控台|动作迁移首帧生产线|流程工作台/],
    forbidden: [/场景引擎/, /白底商品图/, /场景配方库/, /ScenePlus/]
  },
  {
    name: 'image2 admin',
    path: '/admin',
    required: [/Image2\s*后台/, /案例库运营入口/],
    forbidden: [/场景引擎/, /白底商品图/, /场景配方库/, /ScenePlus/]
  },
  {
    name: 'image2 admin cases',
    path: '/admin/image2-cases',
    required: [/Image2\s*案例库运营入口/, /案例库展示/],
    forbidden: [/场景引擎/, /白底商品图/, /场景配方库/, /ScenePlus/]
  },
  {
    name: 'image2 auth callback',
    path: '/auth/callback',
    required: [/Image2\s*账号|邮箱验证|正在验证邮箱链接/],
    forbidden: [/场景引擎/, /白底商品图/, /场景配方库/, /ScenePlus/]
  },
  {
    name: 'image2 gacha',
    path: '/image2-cases/gacha',
    required: [/Image2\s*同款抽卡|Image2\s*案例库同款抽卡|从收藏图里抽出下一张高分图/],
    forbidden: [/场景引擎/, /白底商品图/, /场景配方库/, /ScenePlus/]
  },
  {
    name: 'image2 social-commerce isolation',
    path: '/image2-social-commerce',
    required: [/Image2\s*案例灵感库|Image2\s*案例库|从爆款图到可复刻提示词/],
    forbidden: [/场景引擎/, /白底商品图/, /场景配方库/, /ScenePlus/],
    expectedFinalPath: '/image2-cases'
  }
];

const scenePages: PageCheck[] = [
  {
    name: 'scene home',
    path: '/',
    required: [/场景引擎/, /白底商品图/],
    forbidden: [/ScenePlus/]
  },
  {
    name: 'scene social commerce',
    path: '/image2-social-commerce',
    required: [/场景引擎/, /白底商品图/],
    forbidden: [/ScenePlus/]
  },
  {
    name: 'scene workbench',
    path: '/workbench',
    required: [/AI\s*创作工作台|上传商品/, /图片额度|生成结果/],
    forbidden: [/ScenePlus/]
  },
  {
    name: 'scene auth callback',
    path: '/auth/callback',
    required: [/场景引擎账号|邮箱验证|邮箱链接缺少登录令牌/],
    forbidden: [/ScenePlus/]
  },
  {
    name: 'scene social-commerce workbench',
    path: '/image2-social-commerce/workbench',
    required: [/AI\s*创作工作台|上传商品/, /图片额度|生成结果/],
    forbidden: [/ScenePlus/]
  },
  {
    name: 'scene templates',
    path: '/image2-social-commerce/templates',
    required: [/场景模板/, /保存率|模板矩阵/],
    forbidden: [/ScenePlus/]
  },
  {
    name: 'scene pricing',
    path: '/image2-social-commerce/pricing',
    required: [/图片额度价格|价格方案/, /¥9\.9|29|99/],
    forbidden: [/ScenePlus/]
  },
  {
    name: 'scene ops',
    path: '/image2-social-commerce/admin-template-ops',
    required: [/场景模板运营台|运营台/, /保存率|生成成功率|额度耗尽/],
    forbidden: [/ScenePlus/]
  }
];

const picturePages: PageCheck[] = [
  {
    name: 'picture home',
    path: '/',
    required: [/AI\s*制图台/, /登录后开始生成/, /我的历史/, /文生图/, /图生图/, /智能改图/, /高速通道/, /稳定通道/, /1k/, /2k/, /4k/, /上传/, /下载/, /放大/],
    forbidden: [/image2/i, /ikun/i, /runninghub/i, /场景引擎/, /案例库/]
  },
  {
    name: 'picture workbench',
    path: '/workbench',
    required: [/AI\s*制图台/, /登录后开始生成/, /我的历史/, /生成通道/, /画面比例/, /分辨率/, /随机种子/, /开始生成/],
    forbidden: [/image2/i, /ikun/i, /runninghub/i, /场景引擎/, /案例库/]
  }
];

function urlFor(base: string, path: string) {
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => {
    const documentElement = document.documentElement;
    const body = document.body;
    return {
      bodyScrollWidth: body.scrollWidth,
      bodyClientWidth: body.clientWidth,
      documentScrollWidth: documentElement.scrollWidth,
      documentClientWidth: documentElement.clientWidth
    };
  });

  const bodyOverflow = metrics.bodyScrollWidth - metrics.bodyClientWidth;
  const documentOverflow = metrics.documentScrollWidth - metrics.documentClientWidth;
  expect(Math.max(bodyOverflow, documentOverflow)).toBeLessThanOrEqual(3);
}

async function expectVisiblySelected(page: Page, buttonName: string) {
  const button = page.getByRole('button', { name: buttonName, exact: true });
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(
      async () =>
        button.evaluate((element) => {
          const computed = getComputedStyle(element);
          return {
            backgroundImage: computed.backgroundImage,
            boxShadow: computed.boxShadow,
            color: computed.color
          };
        }),
      { message: `${buttonName} should finish its selected-state transition` }
    )
    .toEqual(
      expect.objectContaining({
        color: 'rgb(255, 255, 255)',
        backgroundImage: expect.stringContaining('linear-gradient'),
        boxShadow: expect.not.stringMatching(/^none$/)
      })
    );
}

async function checkPage(page: Page, base: string, check: PageCheck, hostHeader?: string) {
  if (hostHeader) {
    await page.setExtraHTTPHeaders({ 'x-forwarded-host': hostHeader });
  }

  const response = await page.goto(urlFor(base, check.path), { waitUntil: 'domcontentloaded' });
  expect(response?.ok(), `${check.name} should return 2xx`).toBe(true);

  if (check.expectedFinalPath) {
    expect(new URL(page.url()).pathname, `${check.name} final path`).toBe(check.expectedFinalPath);
  }

  const body = page.locator('body');
  await expect(body).toBeVisible();

  for (const marker of check.required) {
    await expect(body, `${check.name} should contain ${marker}`).toContainText(marker, { timeout: 10000 });
  }

  const text = await body.innerText();
  for (const marker of check.required) {
    expect(text, `${check.name} should contain ${marker}`).toMatch(marker);
  }

  for (const marker of check.forbidden ?? []) {
    expect(text, `${check.name} should not contain ${marker}`).not.toMatch(marker);
  }

  await expectNoHorizontalOverflow(page);
}

test.describe('Image2 public and scene domains', () => {
  for (const check of image2Pages) {
    test(`${check.name} keeps case-library positioning`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await checkPage(page, image2Base, check);
    });
  }

  for (const check of scenePages) {
    test(`${check.name} keeps configured scene routing on desktop`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await checkPage(page, sceneBase, check);
    });
  }

  for (const check of picturePages) {
    test(`${check.name} renders public picture studio`, async ({ page }) => {
      await page.setViewportSize({ width: 430, height: 932 });
      await checkPage(page, pictureBase, check, pictureHostHeader);
    });
  }

  test('picture controls show clear selected feedback after taps', async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 932 });
    await checkPage(page, pictureBase, picturePages[0], pictureHostHeader);

    await expectVisiblySelected(page, '文生图');
    await expectVisiblySelected(page, '高速通道');
    await expectVisiblySelected(page, '9:16');
    await expectVisiblySelected(page, '2k');
    await expectVisiblySelected(page, '随机');

    await page.getByRole('button', { name: '图生图', exact: true }).click();
    await page.getByRole('button', { name: '稳定通道', exact: true }).click();
    await page.getByRole('button', { name: '4k', exact: true }).click();
    await page.getByRole('button', { name: '固定种子', exact: true }).click();

    await expect(page.getByRole('button', { name: '文生图', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expectVisiblySelected(page, '图生图');
    await expectVisiblySelected(page, '稳定通道');
    await expectVisiblySelected(page, '4k');
    await expectVisiblySelected(page, '固定种子');
  });

  for (const check of [image2Pages[0], image2Pages[2], image2Pages[4], image2Pages[6], scenePages[0], scenePages[2], scenePages[6], picturePages[0]]) {
    test(`${check.name} has no obvious mobile horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const base = check.name.startsWith('image2') ? image2Base : check.name.startsWith('picture') ? pictureBase : sceneBase;
      await checkPage(page, base, check, check.name.startsWith('picture') ? pictureHostHeader : undefined);
    });
  }
});
