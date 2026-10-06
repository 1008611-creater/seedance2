import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

/**
 * 案例详情页（SEO 着陆页）。
 *
 * 背景：案例详情原先只是列表页里的前端弹窗，没有独立 URL、也不做服务端渲染，
 * 因此 1569 条案例对搜索引擎完全不可见（实测：sitemap 只有 2 个 URL，
 * 列表页 HTML 里 case-card 数量为 0）。本页把每条案例变成可索引的独立页面。
 *
 * 索引范围由 sitemap 决定：只收录「有图 + 非可参考」的 838 条，避免低质页面拉低整站质量。
 * 生成策略用 ISR：预生成精选层，其余按需生成并缓存，避免构建时间与磁盘膨胀。
 */

export const revalidate = 86400;

const DATA_DIR = path.join(process.cwd(), "public", "data");
const SITE_URL = (process.env.NEXT_PUBLIC_IMAGE2_SITE_URL || "https://image2.cauai.fun").replace(/\/+$/, "");

type CaseItem = {
  detailKey: string;
  caseCode?: string;
  title: string;
  categoryLabel?: string;
  category?: string;
  imageUrl?: string;
  imageAlt?: string;
  imageStatus?: string;
  sourceLabel?: string;
  sourceName?: string;
  sourceUrl?: string;
  githubUrl?: string;
  author?: string;
  model?: string;
  promptKind?: string;
  promptPreview?: string;
  valueTier?: string;
  featured?: boolean;
};

type CaseDetail = {
  detailKey: string;
  prompt?: string;
  sourceUrl?: string;
  githubUrl?: string;
  sourceLabel?: string;
  sourceNote?: string;
  promptStructure?: Record<string, string>;
  reuseProfile?: Record<string, string>;
  replicationGuide?: Record<string, string>;
};

let indexCache: CaseItem[] | null = null;

function readIndex(): CaseItem[] {
  if (indexCache) return indexCache;
  const raw = fs.readFileSync(path.join(DATA_DIR, "image2-case-library.index.json"), "utf8");
  const parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
  indexCache = (parsed.cases || []) as CaseItem[];
  return indexCache;
}

function readDetail(detailKey: string): CaseDetail | null {
  const file = path.join(DATA_DIR, "image2-cases", `${detailKey}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")) as CaseDetail;
  } catch {
    return null;
  }
}

function findCase(code: string): CaseItem | undefined {
  return readIndex().find((item) => item.detailKey === code);
}

function proxySrc(url?: string): string {
  if (!url) return "";
  return url.startsWith("/") ? url : `/api/image2/proxy?url=${encodeURIComponent(url)}`;
}

export async function generateStaticParams() {
  // 只预生成精选层，其余按需 ISR；避免 838 页全量 SSG 拖长构建。
  return readIndex()
    .filter((item) => item.featured && item.imageUrl)
    .map((item) => ({ code: item.detailKey }));
}

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const item = findCase(code);
  if (!item) return { title: "案例未找到 - Image2 案例灵感库" };

  const title = `${item.title} - Image2 案例与提示词`;
  const description = (item.promptPreview || "").slice(0, 150) || `${item.title}，来自 ${item.sourceLabel || item.sourceName || "Image2 案例库"} 的可复用提示词案例。`;

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    alternates: { canonical: `/image2-cases/${item.detailKey}` },
    openGraph: {
      type: "article",
      url: `/image2-cases/${item.detailKey}`,
      siteName: "Image2",
      title,
      description,
      images: item.imageUrl ? [{ url: proxySrc(item.imageUrl) }] : undefined
    }
  };
}

export default async function CaseDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const item = findCase(code);
  if (!item) notFound();

  const detail = readDetail(item.detailKey);
  const related = readIndex()
    .filter((x) => x.categoryLabel === item.categoryLabel && x.detailKey !== item.detailKey && x.imageUrl)
    .slice(0, 8);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <nav className="mb-6 text-sm text-neutral-500">
        <Link href="/image2-cases" className="hover:underline">
          Image2 案例灵感库
        </Link>
        <span className="mx-2">/</span>
        <span>{item.categoryLabel || item.category || "案例"}</span>
      </nav>

      <h1 className="text-2xl font-semibold leading-snug">{item.title}</h1>

      <div className="mt-3 flex flex-wrap gap-3 text-sm text-neutral-500">
        {item.author ? <span>作者：{item.author}</span> : null}
        {item.model ? <span>模型：{item.model}</span> : null}
        {item.sourceLabel || item.sourceName ? <span>来源：{item.sourceLabel || item.sourceName}</span> : null}
        {item.promptKind ? <span>类型：{item.promptKind}</span> : null}
      </div>

      {item.imageUrl ? (
        <figure className="mt-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={proxySrc(item.imageUrl)}
            alt={item.imageAlt || item.title}
            className="w-full rounded-lg border border-neutral-200"
            loading="eager"
          />
          <figcaption className="mt-2 text-xs text-neutral-500">效果图（来自原始来源，经本站代理加载）</figcaption>
        </figure>
      ) : (
        <p className="mt-6 rounded-lg border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
          该案例来源未附效果图，仅提供提示词文本。
        </p>
      )}

      {detail?.prompt ? (
        <section className="mt-8">
          <h2 className="text-lg font-medium">原始提示词</h2>
          <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-lg bg-neutral-50 p-4 text-sm leading-relaxed">
            {detail.prompt}
          </pre>
        </section>
      ) : null}

      {detail?.promptStructure ? (
        <section className="mt-8">
          <h2 className="text-lg font-medium">提示词结构</h2>
          <dl className="mt-3 grid gap-2 text-sm">
            {Object.entries(detail.promptStructure)
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="flex gap-3">
                  <dt className="w-24 shrink-0 text-neutral-500">{k}</dt>
                  <dd className="flex-1">{v}</dd>
                </div>
              ))}
          </dl>
        </section>
      ) : null}

      {detail?.reuseProfile ? (
        <section className="mt-8">
          <h2 className="text-lg font-medium">复用评估</h2>
          <dl className="mt-3 grid gap-2 text-sm">
            {Object.entries(detail.reuseProfile)
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="flex gap-3">
                  <dt className="w-24 shrink-0 text-neutral-500">{k}</dt>
                  <dd className="flex-1">{v}</dd>
                </div>
              ))}
          </dl>
        </section>
      ) : null}

      {detail?.replicationGuide ? (
        <section className="mt-8">
          <h2 className="text-lg font-medium">复现指南</h2>
          <dl className="mt-3 grid gap-2 text-sm">
            {Object.entries(detail.replicationGuide)
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="flex gap-3">
                  <dt className="w-24 shrink-0 text-neutral-500">{k}</dt>
                  <dd className="flex-1">{v}</dd>
                </div>
              ))}
          </dl>
        </section>
      ) : null}

      <section className="mt-8 text-sm text-neutral-600">
        <h2 className="text-lg font-medium">来源与授权</h2>
        <ul className="mt-3 space-y-1">
          {item.sourceLabel || item.sourceName ? <li>来源：{item.sourceLabel || item.sourceName}</li> : null}
          {detail?.sourceUrl || item.sourceUrl ? (
            <li>
              原始链接：
              <a href={detail?.sourceUrl || item.sourceUrl} target="_blank" rel="noreferrer noopener" className="underline">
                {detail?.sourceUrl || item.sourceUrl}
              </a>
            </li>
          ) : null}
          {detail?.sourceNote ? <li>说明：{detail.sourceNote}</li> : null}
        </ul>
      </section>

      {related.length ? (
        <section className="mt-10">
          <h2 className="text-lg font-medium">同类案例</h2>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {related.map((r) => (
              <li key={r.detailKey}>
                <Link href={`/image2-cases/${r.detailKey}`} className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={proxySrc(r.imageUrl)}
                    alt={r.imageAlt || r.title}
                    className="aspect-square w-full rounded border border-neutral-200 object-cover"
                    loading="lazy"
                  />
                  <span className="mt-1 block truncate text-xs text-neutral-600">{r.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="mt-10">
        <Link href="/image2-cases" className="text-sm underline">
          ← 返回案例库
        </Link>
      </p>
    </main>
  );
}
