import { expect, test, type Page } from '@playwright/test';

const image2Base = (process.env.IMAGE2_PUBLIC_BASE_URL ?? 'https://image2.cauai.fun').replace(/\/+$/, '');
const sceneBase = (process.env.IMAGE2_SCENE_BASE_URL ?? 'https://scene.lsb0713.online').replace(/\/+$/, '');
const pictureBase = (process.env.PICTURE_STUDIO_BASE_URL ?? 'https://picture.lsb0713.online').replace(/\/+$/, '');
const image2HostHeader = process.env.IMAGE2_PUBLIC_HOST_HEADER;
const sceneHostHeader = process.env.IMAGE2_SCENE_HOST_HEADER;
const pictureHostHeader = process.env.PICTURE_STUDIO_HOST_HEADER;

type PageCheck = {
  name: string;
  path: string;
  title?: RegExp;
  required: RegExp[];
  forbidden?: RegExp[];
  expectedFinalPath?: string;
  // 后台页在无管理员会话时只渲染 AdminSessionGate 登录闸门，真实运营内容只在已认证态出现。
  // 两个分支各自配置必含文案，避免用 alternation 让闸门外壳文案掩盖后台内容回归。
  adminGate?: {
    signedIn: RegExp[];
  };
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
    title: /Image2 后台入口/,
    required: [/Image2\s*后台|Image2\s*Admin/i],
    adminGate: { signedIn: [/选择要进入的运营后台/, /案例库运营入口/] },
    forbidden: [/场景引擎/, /白底商品图/, /场景配方库/, /ScenePlus/]
  },
  {
    name: 'image2 admin cases',
    path: '/admin/image2-cases',
    title: /Image2 案例库运营后台/,
    required: [/Image2\s*Admin|Image2\s*案例库/i],
    adminGate: { signedIn: [/后台 \/ Image2 案例库/, /公开案例库/] },
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
    required: [/AI\s*制图台/, /登录后开始生成/, /我的历史/, /文生图/, /图生图/, /智能改图/, /McGrox\s*·\s*Sunburst/, /1k/, /2k/, /4k/, /上传/, /下载/, /放大/],
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

  if (check.title) {
    await expect(page, `${check.name} document title`).toHaveTitle(check.title);
  }

  if (check.expectedFinalPath) {
    expect(new URL(page.url()).pathname, `${check.name} final path`).toBe(check.expectedFinalPath);
  }

  const body = page.locator('body');
  await expect(body).toBeVisible();

  for (const marker of check.required) {
    // 本地 dev server 按需编译 + 多 worker 并发时，案例库/抽卡这类数据页首访可能超过 10 秒，放宽到 20 秒。
    await expect(body, `${check.name} should contain ${marker}`).toContainText(marker, { timeout: 20000 });
  }

  const text = await body.innerText();
  for (const marker of check.required) {
    expect(text, `${check.name} should contain ${marker}`).toMatch(marker);
  }

  if (check.adminGate) {
    // 判据是页面实际落到哪个外壳：AdminSessionGate 首屏固定渲染「验证管理员会话」，
    // 等 /api/admin/session 返回后才落到登录闸门或已认证态。
    // Playwright 上下文不携带管理员 Cookie，本地/CI 运行必然落到闸门分支；只有显式注入管理员会话的环境才走已认证分支。
    const gateLoginLink = page.getByRole('link', { name: '使用管理员账号登录' });
    const signedInLogout = page.getByRole('button', { name: '退出' });
    const adminDeadline = Date.now() + 20000;
    let adminShell: 'checking' | 'gate' | 'signed-in' = 'checking';
    while (Date.now() < adminDeadline) {
      if ((await gateLoginLink.count()) > 0) {
        adminShell = 'gate';
        break;
      }
      if ((await signedInLogout.count()) > 0) {
        adminShell = 'signed-in';
        break;
      }
      await page.waitForTimeout(200);
    }
    expect(adminShell, `${check.name} admin session gate should settle`).not.toBe('checking');

    if (adminShell === 'gate') {
      // 闸门分支：断言闸门自身的标题与登录入口，而不是用 alternation 兜底。
      await expect(page.getByRole('heading', { name: /需要管理员登录|没有管理员权限/ })).toBeVisible();
      await expect(gateLoginLink).toBeVisible();
    } else {
      // 已认证分支：断言真正的运营后台文案。
      for (const marker of check.adminGate.signedIn) {
        await expect(body, `${check.name} should contain ${marker} after admin sign-in`).toContainText(marker, { timeout: 20000 });
      }
    }
  }

  for (const marker of check.forbidden ?? []) {
    expect(text, `${check.name} should not contain ${marker}`).not.toMatch(marker);
  }

  await expectNoHorizontalOverflow(page);
}

function baseFor(check: PageCheck) {
  if (check.name.startsWith('picture')) return pictureBase;
  if (check.name.startsWith('scene')) return sceneBase;
  return image2Base;
}

function hostHeaderFor(check: PageCheck) {
  if (check.name.startsWith('picture')) return pictureHostHeader;
  if (check.name.startsWith('scene')) return sceneHostHeader;
  return image2HostHeader;
}

test.describe.configure({ timeout: 60000 });

test.describe('Image2 public and scene domains', () => {
  for (const check of image2Pages) {
    test(`${check.name} keeps case-library positioning`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await checkPage(page, image2Base, check, image2HostHeader);
    });
  }

  for (const check of scenePages) {
    test(`${check.name} keeps configured scene routing on desktop`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await checkPage(page, sceneBase, check, sceneHostHeader);
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
    await expectVisiblySelected(page, 'McGrox · Sunburst');
    await expectVisiblySelected(page, '9:16');
    await expectVisiblySelected(page, '2k');
    await expectVisiblySelected(page, '随机');

    // 首屏为 SSR，事件要等 hydration 才挂载；高并发下点击可能落在挂载之前而被丢弃，因此整段交互用 toPass 重试。
    await expect(async () => {
      await page.getByRole('button', { name: '图生图', exact: true }).click();
      await page.getByRole('button', { name: '4k', exact: true }).click();
      await page.getByRole('button', { name: '固定种子', exact: true }).click();

      await expect(page.getByRole('button', { name: '文生图', exact: true })).toHaveAttribute('aria-pressed', 'false', { timeout: 2000 });
      await expect(page.getByRole('button', { name: '图生图', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 2000 });
      await expect(page.getByRole('button', { name: '4k', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 2000 });
      await expect(page.getByRole('button', { name: '固定种子', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 2000 });
    }).toPass({ timeout: 20000 });

    await expectVisiblySelected(page, '图生图');
    await expectVisiblySelected(page, '4k');
    await expectVisiblySelected(page, '固定种子');
  });

  for (const check of [image2Pages[0], image2Pages[2], image2Pages[4], image2Pages[6], scenePages[0], scenePages[2], scenePages[6], picturePages[0]]) {
    test(`${check.name} has no obvious mobile horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await checkPage(page, baseFor(check), check, hostHeaderFor(check));
    });
  }
});
