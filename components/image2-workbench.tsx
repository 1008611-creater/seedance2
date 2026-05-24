"use client";

import {
  BadgeCheck,
  Check,
  Clipboard,
  Copy,
  ExternalLink,
  Eye,
  Film,
  FolderOpen,
  Grid3X3,
  Images,
  Loader2,
  Maximize2,
  MessageSquare,
  MonitorPlay,
  Palette,
  Plus,
  RotateCcw,
  Search,
  Send,
  Shirt,
  Sparkles,
  SquareStack,
  ThumbsUp,
  Upload,
  WandSparkles,
  Wrench,
  X
} from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import type {
  Image2WorkbenchData,
  WorkbenchAsset,
  WorkbenchAssetKind,
  WorkbenchCase,
  WorkbenchFeedback,
  WorkbenchFeedbackRating,
  WorkbenchFeedbackStage,
  WorkbenchPromptTemplate,
  WorkbenchPromptTemplateStage
} from "@/lib/image2-workbench-data";

type WorkbenchView = "workflow" | "matrix" | "templates" | "results" | "cases";
type GeneratedStage = "outfit" | "first-frame";

type GeneratedWorkbenchImage = {
  createdAt: string;
  dataUrl?: string;
  id: string;
  name: string;
  outDir: string;
  prompt: string;
  stage: GeneratedStage;
  assetId?: string;
  src?: string;
};

type GenerationPayload = {
  elapsedSeconds?: number;
  images?: Array<{ dataUrl?: string; name?: string }>;
  outDir?: string;
  sharedAssets?: WorkbenchAsset[];
  error?: string;
};

type FeedbackTarget = {
  assetId: string;
  name: string;
  prompt: string;
  referenceIds: string[];
  stage: WorkbenchFeedbackStage;
  src?: string;
};

type FeedbackPayload = {
  feedback?: WorkbenchFeedback;
  feedbackStats?: Image2WorkbenchData["feedbackStats"];
  error?: string;
};

const historyStorageKey = "image2-motion-workbench-history:v2";
const legacyHistoryStorageKey = "image2-motion-workbench-history:v1";
const viewOptions: Array<{ id: WorkbenchView; label: string; icon: typeof Grid3X3 }> = [
  { id: "workflow", label: "流程工作台", icon: SquareStack },
  { id: "matrix", label: "素材矩阵", icon: Grid3X3 },
  { id: "templates", label: "提示词模板", icon: Palette },
  { id: "results", label: "生成结果", icon: Images },
  { id: "cases", label: "案例参考", icon: Sparkles }
];
const assetKindOptions: Array<{ kind: WorkbenchAssetKind; label: string; icon: typeof Images }> = [
  { kind: "person", label: "人物", icon: BadgeCheck },
  { kind: "clothing", label: "服装", icon: Shirt },
  { kind: "scene", label: "场景", icon: MonitorPlay },
  { kind: "motion", label: "动作", icon: Film },
  { kind: "result", label: "结果", icon: Images }
];
const sizeOptions = [
  { value: "1024x1536", label: "竖图 1024x1536" },
  { value: "1024x1024", label: "方图 1024x1024" },
  { value: "1536x1024", label: "横图 1536x1024" }
];
const feedbackReasons = ["人物不像", "服装不准", "场景不融合", "构图不适合动作迁移", "手脚/肢体问题", "画质/水印文字", "操作流程卡点", "其他"];
const feedbackRatingOptions: Array<{ rating: WorkbenchFeedbackRating; label: string; icon: typeof ThumbsUp }> = [
  { rating: "usable", label: "可用", icon: ThumbsUp },
  { rating: "needs-fix", label: "待修", icon: Wrench },
  { rating: "reject", label: "废图", icon: X }
];

export function Image2Workbench({ initialData }: { initialData: Image2WorkbenchData }) {
  const [data, setData] = useState(initialData);
  const [activeView, setActiveView] = useState<WorkbenchView>("workflow");
  const [activeAssetKind, setActiveAssetKind] = useState<WorkbenchAssetKind>("person");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => initialSelections(initialData.assets));
  const [outfitTemplateId, setOutfitTemplateId] = useState(() => firstTemplateId(initialData.promptTemplates, "outfit"));
  const [frameTemplateId, setFrameTemplateId] = useState(() => firstTemplateId(initialData.promptTemplates, "first-frame"));
  const [outfitNote, setOutfitNote] = useState("保留人物身份，服装细节准确，画面干净，适合作为后续首帧素材。");
  const [frameNote, setFrameNote] = useState("竖版 9:16，人物全身可迁移，背景真实，主体和服装延续一致。");
  const [size, setSize] = useState("1024x1536");
  const [generating, setGenerating] = useState<GeneratedStage | null>(null);
  const [generationError, setGenerationError] = useState("");
  const [history, setHistory] = useState<GeneratedWorkbenchImage[]>([]);
  const [previewAsset, setPreviewAsset] = useState<WorkbenchAsset | null>(null);
  const [templatePickerStage, setTemplatePickerStage] = useState<WorkbenchPromptTemplateStage | null>(null);
  const [promptModalStage, setPromptModalStage] = useState<GeneratedStage | null>(null);
  const [casePreview, setCasePreview] = useState<WorkbenchCase | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackTarget, setFeedbackTarget] = useState<FeedbackTarget | null>(null);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(historyStorageKey) ?? window.localStorage.getItem(legacyHistoryStorageKey);
      if (raw) setHistory(JSON.parse(raw).slice(0, 24));
      if (!window.localStorage.getItem(historyStorageKey) && window.localStorage.getItem(legacyHistoryStorageKey)) {
        window.localStorage.removeItem(legacyHistoryStorageKey);
      }
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      historyStorageKey,
      JSON.stringify(
        history
          .filter((item) => item.src || item.assetId)
          .slice(0, 24)
          .map((item) => {
            const compact = { ...item };
            delete compact.dataUrl;
            return compact;
          })
      )
    );
  }, [history]);

  async function refreshData() {
    const response = await fetch("/api/image2-workbench", { cache: "no-store" });
    const payload = (await response.json()) as Image2WorkbenchData & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "刷新失败。");
    setData(payload);
    setSelectedIds((current) => ({ ...initialSelections(payload.assets), ...current }));
    return payload;
  }

  const assetsById = useMemo(() => new Map(data.assets.map((asset) => [asset.id, asset])), [data.assets]);
  const assetsByKind = useMemo(() => groupAssetsByKind(data.assets), [data.assets]);
  const feedbackByAssetId = useMemo(() => latestFeedbackByAssetId(data.feedback), [data.feedback]);
  const selectedPerson = selectedIds.person ? assetsById.get(selectedIds.person) : undefined;
  const selectedClothing = selectedIds.clothing ? assetsById.get(selectedIds.clothing) : undefined;
  const selectedScene = selectedIds.scene ? assetsById.get(selectedIds.scene) : undefined;
  const selectedMotion = selectedIds.motion ? assetsById.get(selectedIds.motion) : undefined;
  const selectedResultAsset = selectedIds.result ? assetsById.get(selectedIds.result) : undefined;
  const latestOutfit = history.find((item) => item.stage === "outfit");
  const latestFrame = history.find((item) => item.stage === "first-frame");
  const sharedResults = useMemo(
    () =>
      [...data.assets]
        .filter((item) => item.kind === "result")
        .sort((a, b) => {
          const rank = (item: WorkbenchAsset) => (item.origin === "generated" ? 0 : item.origin === "upload" ? 1 : 2);
          const rankDiff = rank(a) - rank(b);
          if (rankDiff) return rankDiff;
          const timeA = a.createdAt ? Date.parse(a.createdAt) : 0;
          const timeB = b.createdAt ? Date.parse(b.createdAt) : 0;
          return timeB - timeA;
        }),
    [data.assets]
  );
  const outfitTemplate = findTemplate(data.promptTemplates, outfitTemplateId, "outfit");
  const frameTemplate = findTemplate(data.promptTemplates, frameTemplateId, "first-frame");
  const outfitPrompt = buildPrompt(outfitTemplate, {
    person: selectedPerson?.title ?? "人物参考图",
    clothing: selectedClothing?.title ?? "服装参考图",
    outfit: latestOutfit?.name ?? selectedResultAsset?.title ?? "人物穿搭图",
    scene: selectedScene?.title ?? "场景参考图",
    motion: selectedMotion?.title ?? "动作参考",
    note: outfitNote
  });
  const framePrompt = buildPrompt(frameTemplate, {
    person: selectedPerson?.title ?? "人物参考图",
    clothing: selectedClothing?.title ?? "服装参考图",
    outfit: latestOutfit?.name ?? selectedResultAsset?.title ?? "人物穿搭图",
    scene: selectedScene?.title ?? "场景参考图",
    motion: selectedMotion?.title ?? "动作参考",
    note: frameNote
  });
  const filteredAssets = useMemo(
    () => filterAssets(assetsByKind[activeAssetKind] ?? [], query),
    [activeAssetKind, assetsByKind, query]
  );

  function selectAsset(asset: WorkbenchAsset) {
    setSelectedIds((current) => ({ ...current, [asset.kind]: asset.id }));
  }

  function openFeedbackForAsset(asset: WorkbenchAsset) {
    setFeedbackTarget({
      assetId: asset.id,
      name: asset.title,
      prompt: asset.prompt ?? asset.promptHint ?? "",
      referenceIds: [],
      stage: asset.stage ?? "manual",
      src: localImageSrc(asset.previewPath)
    });
    setIsFeedbackOpen(true);
  }

  async function copyText(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(""), 1600);
  }

  function applyFeedbackPromptPatch(stage: WorkbenchPromptTemplateStage, patch: string) {
    const normalizedPatch = patch.trim();
    const nextLine = `迭代补丁：${normalizedPatch}`;
    const appendPatch = (current: string) => {
      const trimmed = current.trim();
      if (!normalizedPatch || trimmed.includes(normalizedPatch)) return current;
      return trimmed ? `${trimmed}\n${nextLine}` : nextLine;
    };

    if (stage === "outfit") setOutfitNote(appendPatch);
    if (stage === "first-frame") setFrameNote(appendPatch);
  }

  async function submitFeedback(input: {
    rating: WorkbenchFeedbackRating;
    reasons: string[];
    note: string;
    target: FeedbackTarget;
  }) {
    const response = await fetch("/api/image2-workbench/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assetId: input.target.assetId,
        stage: input.target.stage,
        rating: input.rating,
        reasons: input.reasons,
        note: input.note,
        prompt: input.target.prompt,
        referenceIds: input.target.referenceIds
      })
    });
    const payload = (await response.json()) as FeedbackPayload;
    if (!response.ok || !payload.feedback || !payload.feedbackStats) throw new Error(payload.error ?? "反馈保存失败。");
    setData((current) => ({
      ...current,
      feedback: [payload.feedback!, ...current.feedback.filter((item) => item.id !== payload.feedback!.id)].slice(0, 500),
      feedbackStats: payload.feedbackStats!
    }));
  }

  async function generate(stage: GeneratedStage) {
    setGenerationError("");
    const isOutfit = stage === "outfit";
    const prompt = isOutfit ? outfitPrompt : framePrompt;
    const referenceIds = isOutfit
      ? [selectedPerson?.id, selectedClothing?.id]
      : [selectedResultAsset?.id, selectedScene?.id, selectedMotion?.id];
    const references =
      !isOutfit && !selectedResultAsset && latestOutfit?.dataUrl ? [{ name: latestOutfit.name, dataUrl: latestOutfit.dataUrl }] : [];

    if (referenceIds.filter(Boolean).length + references.length < 2) {
      setGenerationError(isOutfit ? "请选择人物图和服装图。" : "请选择人物穿搭图和场景图。");
      return;
    }

    setGenerating(stage);
    try {
      const selectedReferenceIds = referenceIds.filter((id): id is string => Boolean(id));
      const response = await fetch("/api/image2-workbench/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage,
          prompt,
          size,
          n: 1,
          referenceIds: selectedReferenceIds,
          references
        })
      });
      const payload = (await response.json()) as GenerationPayload;
      if (!response.ok) throw new Error(payload.error ?? "生成失败。");

      const nextImages = (payload.images ?? [])
        .filter((item): item is { dataUrl: string; name?: string } => Boolean(item.dataUrl))
        .map((item, index) => ({
          createdAt: new Date().toISOString(),
          id: `${stage}-${Date.now()}-${index}`,
          name: item.name || (stage === "outfit" ? "人物穿搭图" : "视频首帧图"),
          outDir: payload.outDir || "",
          prompt,
          stage,
          assetId: payload.sharedAssets?.[index]?.id,
          src: payload.sharedAssets?.[index]?.previewPath ? localImageSrc(payload.sharedAssets[index].previewPath) : item.dataUrl
        }));

      if (!nextImages.length) throw new Error("生成完成但没有返回图片。");
      setHistory((current) => [...nextImages, ...current].slice(0, 24));
      if (payload.sharedAssets?.[0]) {
        await refreshData();
        setSelectedIds((current) => ({ ...current, result: payload.sharedAssets![0].id }));
        setFeedbackTarget({
          assetId: payload.sharedAssets[0].id,
          name: payload.sharedAssets[0].title,
          prompt,
          referenceIds: selectedReferenceIds,
          stage,
          src: localImageSrc(payload.sharedAssets[0].previewPath)
        });
        setIsFeedbackOpen(true);
      }
      setActiveView("results");
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "生成失败。");
    } finally {
      setGenerating(null);
    }
  }

  return (
    <main className="image2-workbench">
      <aside className="image2-workbench-sidebar" aria-label="Image2 作图导航">
        <a className="image2-workbench-brand" href="/">
          <span>
            <WandSparkles aria-hidden="true" />
          </span>
          <strong>Image2 作图中控台</strong>
          <small>动作迁移首帧生产线</small>
        </a>

        <nav className="image2-workbench-nav" aria-label="工作台界面">
          {viewOptions.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={activeView === item.id ? "active" : ""}
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id)}
              >
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <section className="image2-workbench-sidebar-tools" aria-label="作图工具">
          <label>
            <span>出图尺寸</span>
            <select value={size} onChange={(event) => setSize(event.target.value)}>
              {sizeOptions.map((item) => (
                <option value={item.value} key={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => setIsUploadOpen(true)}>
            <Upload aria-hidden="true" />
            上传素材
          </button>
          <button type="button" onClick={() => setIsFeedbackOpen(true)}>
            <MessageSquare aria-hidden="true" />
            体验反馈
          </button>
          <button type="button" onClick={() => void refreshData()}>
            <RotateCcw aria-hidden="true" />
            刷新素材
          </button>
        </section>

        <section className="image2-workbench-channel">
          <div>
            <span className="live-dot" />
            <strong>Ikun Image2</strong>
          </div>
          <p>默认走 Monkey Tools NewAPI / gpt-image-2，本机配置由全局 skill 管理。</p>
        </section>

        <div className="image2-workbench-links">
          {data.referenceLinks.map((item) => (
            <a href={item.href} key={item.href}>
              <FolderOpen aria-hidden="true" />
              <span>
                <strong>{item.label}</strong>
                <small>{item.note}</small>
              </span>
            </a>
          ))}
        </div>
      </aside>

      <section className="image2-workbench-main">
        {activeView === "workflow" ? (
          <WorkflowView
            copied={copied}
            framePrompt={framePrompt}
            frameTemplate={frameTemplate}
            generationError={generationError}
            generating={generating}
            history={history}
            latestFrame={latestFrame}
            latestOutfit={latestOutfit}
            onCopyText={copyText}
            onGenerate={generate}
            onOpenPrompt={setPromptModalStage}
            onOpenTemplate={setTemplatePickerStage}
            onOpenMatrixKind={(kind) => {
              setActiveAssetKind(kind);
              setActiveView("matrix");
            }}
            onPreviewAsset={setPreviewAsset}
            outfitPrompt={outfitPrompt}
            outfitTemplate={outfitTemplate}
            selectedClothing={selectedClothing}
            selectedMotion={selectedMotion}
            selectedPerson={selectedPerson}
            selectedResultAsset={selectedResultAsset}
            selectedScene={selectedScene}
          />
        ) : null}

        {activeView === "matrix" ? (
          <MatrixView
            activeAssetKind={activeAssetKind}
            assetsByKind={assetsByKind}
            filteredAssets={filteredAssets}
            onKindChange={setActiveAssetKind}
            onPreviewAsset={setPreviewAsset}
            onSelectAsset={selectAsset}
            onUpload={() => setIsUploadOpen(true)}
            query={query}
            selectedIds={selectedIds}
            setQuery={setQuery}
          />
        ) : null}

        {activeView === "templates" ? (
          <TemplatesView
            activeFrameTemplateId={frameTemplateId}
            activeOutfitTemplateId={outfitTemplateId}
            frameNote={frameNote}
            onFrameNoteChange={setFrameNote}
            onOutfitNoteChange={setOutfitNote}
            onSelectFrameTemplate={setFrameTemplateId}
            onSelectOutfitTemplate={setOutfitTemplateId}
            outfitNote={outfitNote}
            templates={data.promptTemplates}
          />
        ) : null}

        {activeView === "results" ? (
          <ResultsView
            artifacts={data.artifactPaths}
            history={history}
            latestFrame={latestFrame}
            latestOutfit={latestOutfit}
            feedbackByAssetId={feedbackByAssetId}
            onClear={() => setHistory([])}
            onCopyText={copyText}
            onOpenFeedback={openFeedbackForAsset}
            onSelectResult={(asset) => {
              selectAsset(asset);
              setActiveView("workflow");
            }}
            sharedResults={sharedResults}
          />
        ) : null}

        {activeView === "cases" ? (
          <CasesView cases={data.featuredCases} onPreview={setCasePreview} />
        ) : null}
      </section>

      {previewAsset ? <AssetPreviewModal asset={previewAsset} onClose={() => setPreviewAsset(null)} onSelect={selectAsset} /> : null}

      {templatePickerStage ? (
        <TemplatePickerModal
          activeId={templatePickerStage === "outfit" ? outfitTemplateId : frameTemplateId}
          onClose={() => setTemplatePickerStage(null)}
          onSelect={(id) => {
            if (templatePickerStage === "outfit") setOutfitTemplateId(id);
            else setFrameTemplateId(id);
            setTemplatePickerStage(null);
          }}
          stage={templatePickerStage}
          templates={data.promptTemplates.filter((item) => item.stage === templatePickerStage)}
        />
      ) : null}

      {promptModalStage ? (
        <PromptModal
          copied={copied}
          onClose={() => setPromptModalStage(null)}
          onCopyText={copyText}
          prompt={promptModalStage === "outfit" ? outfitPrompt : framePrompt}
          title={promptModalStage === "outfit" ? "人物穿搭图提示词" : "视频首帧图提示词"}
        />
      ) : null}

      {casePreview ? <CasePreviewModal caseItem={casePreview} onClose={() => setCasePreview(null)} /> : null}

      {isUploadOpen ? (
        <AssetUploadModal
          defaultKind={activeAssetKind}
          onClose={() => setIsUploadOpen(false)}
          onUploaded={async (asset) => {
            await refreshData();
            selectAsset(asset);
            setActiveAssetKind(asset.kind);
            setActiveView("matrix");
            setIsUploadOpen(false);
          }}
        />
      ) : null}

      {isFeedbackOpen ? (
        <FeedbackDrawer
          assetsById={assetsById}
          feedback={data.feedback}
          feedbackStats={data.feedbackStats}
          onClose={() => setIsFeedbackOpen(false)}
          onApplyPromptPatch={applyFeedbackPromptPatch}
          onSubmit={submitFeedback}
          target={feedbackTarget}
        />
      ) : null}
    </main>
  );
}

function WorkflowView(props: {
  copied: string;
  framePrompt: string;
  frameTemplate?: WorkbenchPromptTemplate;
  generationError: string;
  generating: GeneratedStage | null;
  history: GeneratedWorkbenchImage[];
  latestFrame?: GeneratedWorkbenchImage;
  latestOutfit?: GeneratedWorkbenchImage;
  onCopyText: (value: string, key: string) => Promise<void>;
  onGenerate: (stage: GeneratedStage) => Promise<void>;
  onOpenMatrixKind: (kind: WorkbenchAssetKind) => void;
  onOpenPrompt: (stage: GeneratedStage) => void;
  onOpenTemplate: (stage: WorkbenchPromptTemplateStage) => void;
  onPreviewAsset: (asset: WorkbenchAsset) => void;
  outfitPrompt: string;
  outfitTemplate?: WorkbenchPromptTemplate;
  selectedClothing?: WorkbenchAsset;
  selectedMotion?: WorkbenchAsset;
  selectedPerson?: WorkbenchAsset;
  selectedResultAsset?: WorkbenchAsset;
  selectedScene?: WorkbenchAsset;
}) {
  const outfitRefs = [props.selectedPerson, props.selectedClothing].filter(Boolean) as WorkbenchAsset[];
  const frameRefs = [props.selectedResultAsset || props.latestOutfit, props.selectedScene, props.selectedMotion].filter(Boolean);
  const outfitReady = Boolean(props.selectedPerson && props.selectedClothing);
  const frameReady = Boolean((props.latestOutfit || props.selectedResultAsset) && props.selectedScene);

  return (
    <section className="image2-workbench-three-window">
      <div className="image2-workflow-layout">
        <div className="image2-workbench-window reference-window">
          <WindowHead index="01" title="参考篮" subtitle="直接从这里换图，不必回头找入口" />
          <div className="image2-selected-reference-grid">
            <SelectedAssetSlot label="人物图" asset={props.selectedPerson} onPick={() => props.onOpenMatrixKind("person")} onPreview={props.onPreviewAsset} />
            <SelectedAssetSlot label="服装图" asset={props.selectedClothing} onPick={() => props.onOpenMatrixKind("clothing")} onPreview={props.onPreviewAsset} />
            <SelectedAssetSlot label="穿搭 / 主图" asset={props.selectedResultAsset} onPick={() => props.onOpenMatrixKind("result")} onPreview={props.onPreviewAsset} />
            <SelectedAssetSlot label="场景图" asset={props.selectedScene} onPick={() => props.onOpenMatrixKind("scene")} onPreview={props.onPreviewAsset} />
            <SelectedAssetSlot label="动作图" asset={props.selectedMotion} onPick={() => props.onOpenMatrixKind("motion")} onPreview={props.onPreviewAsset} />
          </div>

          <div className="image2-window-note">
            <Check aria-hidden="true" />
            <span>先生成穿搭图，再把穿搭图和场景图组合成首帧。动作图可作为构图和姿态参考。</span>
          </div>
        </div>

        <div className="image2-workbench-window prompt-window">
          <WindowHead index="02" title="生成操作区" subtitle="两步生成固定在中间，少跳转、少找按钮" />
          <GenerationStep
            copied={props.copied}
            disabled={!outfitReady}
            disabledReason="缺人物图或服装图"
            isLoading={props.generating === "outfit"}
            onCopyText={props.onCopyText}
            onGenerate={() => props.onGenerate("outfit")}
            onOpenPrompt={() => props.onOpenPrompt("outfit")}
            onOpenTemplate={() => props.onOpenTemplate("outfit")}
            prompt={props.outfitPrompt}
            referenceCount={outfitRefs.length}
            stepLabel="步骤一"
            template={props.outfitTemplate}
            title="人物穿搭图"
          />
          <GenerationStep
            copied={props.copied}
            disabled={!frameReady}
            disabledReason="缺穿搭图或场景图"
            isLoading={props.generating === "first-frame"}
            onCopyText={props.onCopyText}
            onGenerate={() => props.onGenerate("first-frame")}
            onOpenPrompt={() => props.onOpenPrompt("first-frame")}
            onOpenTemplate={() => props.onOpenTemplate("first-frame")}
            prompt={props.framePrompt}
            referenceCount={frameRefs.length}
            stepLabel="步骤二"
            template={props.frameTemplate}
            title="视频首帧图"
          />
          {props.generationError ? <p className="image2-generation-error">{props.generationError}</p> : null}
        </div>

        <div className="image2-workbench-window result-window">
          <WindowHead index="03" title="结果托盘" subtitle="最新产物在右侧停留，方便接着做下一步" />
          <div className="image2-current-results">
            <GeneratedPreview title="最新穿搭图" image={props.latestOutfit} empty="生成后自动作为首帧参考" />
            <GeneratedPreview title="最新首帧图" image={props.latestFrame} empty="首帧会进入动作迁移复盘" />
          </div>
          <div className="image2-result-history-strip">
            {props.history.slice(0, 5).map((item) => (
              <img alt={item.name} key={item.id} src={generatedImageSrc(item)} />
            ))}
            {!props.history.length ? <span>暂无生成历史</span> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function MatrixView(props: {
  activeAssetKind: WorkbenchAssetKind;
  assetsByKind: Record<WorkbenchAssetKind, WorkbenchAsset[]>;
  filteredAssets: WorkbenchAsset[];
  onKindChange: (kind: WorkbenchAssetKind) => void;
  onPreviewAsset: (asset: WorkbenchAsset) => void;
  onSelectAsset: (asset: WorkbenchAsset) => void;
  onUpload: () => void;
  query: string;
  selectedIds: Record<WorkbenchAssetKind, string>;
  setQuery: (value: string) => void;
}) {
  return (
    <section className="image2-workbench-section">
      <SectionHead title="素材矩阵" subtitle="按人物、服装、场景、动作、结果分类，点卡片即加入当前流程。" />
      <div className="image2-matrix-toolbar">
        <div className="image2-asset-kind-tabs">
          {assetKindOptions.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={props.activeAssetKind === item.kind ? "active" : ""}
                key={item.kind}
                type="button"
                onClick={() => props.onKindChange(item.kind)}
              >
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
                <b>{props.assetsByKind[item.kind]?.length ?? 0}</b>
              </button>
            );
          })}
        </div>
        <div className="image2-matrix-actions">
          <label className="image2-search-field">
            <Search aria-hidden="true" />
            <input placeholder="搜索素材名称、标签、备注" value={props.query} onChange={(event) => props.setQuery(event.target.value)} />
          </label>
          <button type="button" onClick={props.onUpload}>
            <Upload aria-hidden="true" />
            上传素材
          </button>
        </div>
      </div>
      <AssetGrid
        assets={props.filteredAssets}
        onPreview={props.onPreviewAsset}
        onSelect={props.onSelectAsset}
        selectedId={props.selectedIds[props.activeAssetKind]}
      />
    </section>
  );
}

function TemplatesView(props: {
  activeFrameTemplateId: string;
  activeOutfitTemplateId: string;
  frameNote: string;
  onFrameNoteChange: (value: string) => void;
  onOutfitNoteChange: (value: string) => void;
  onSelectFrameTemplate: (id: string) => void;
  onSelectOutfitTemplate: (id: string) => void;
  outfitNote: string;
  templates: WorkbenchPromptTemplate[];
}) {
  return (
    <section className="image2-workbench-section">
      <SectionHead title="提示词模板" subtitle="团队成员先选模板，再补少量备注，不需要从空白提示词开始。" />
      <div className="image2-template-columns">
        <TemplateColumn
          activeId={props.activeOutfitTemplateId}
          note={props.outfitNote}
          onNoteChange={props.onOutfitNoteChange}
          onSelect={props.onSelectOutfitTemplate}
          stage="outfit"
          templates={props.templates.filter((item) => item.stage === "outfit")}
          title="人物穿搭图模板"
        />
        <TemplateColumn
          activeId={props.activeFrameTemplateId}
          note={props.frameNote}
          onNoteChange={props.onFrameNoteChange}
          onSelect={props.onSelectFrameTemplate}
          stage="first-frame"
          templates={props.templates.filter((item) => item.stage === "first-frame")}
          title="视频首帧图模板"
        />
      </div>
    </section>
  );
}

function ResultsView(props: {
  artifacts: Image2WorkbenchData["artifactPaths"];
  feedbackByAssetId: Map<string, WorkbenchFeedback>;
  history: GeneratedWorkbenchImage[];
  latestFrame?: GeneratedWorkbenchImage;
  latestOutfit?: GeneratedWorkbenchImage;
  onClear: () => void;
  onCopyText: (value: string, key: string) => Promise<void>;
  onOpenFeedback: (asset: WorkbenchAsset) => void;
  onSelectResult: (asset: WorkbenchAsset) => void;
  sharedResults: WorkbenchAsset[];
}) {
  const artifactCards = [
    { title: "当前主图", path: props.artifacts.mainImage },
    { title: "9 条成片总览", path: props.artifacts.contactSheet },
    { title: "中帧复盘图", path: props.artifacts.middleFrameGrid }
  ].filter((item): item is { title: string; path: string } => Boolean(item.path));

  return (
    <section className="image2-workbench-section">
      <SectionHead title="生成结果" subtitle="这里保留浏览器本地生成历史，以及当前项目沉淀的复盘图。" />
      <div className="image2-results-layout">
        <div className="image2-results-history">
          <div className="image2-results-toolbar">
            <strong>本地生成历史</strong>
            <button type="button" onClick={props.onClear}>
              <X aria-hidden="true" />
              清空
            </button>
          </div>
          <div className="image2-history-grid">
            {props.history.length ? (
              props.history.map((item) => (
                <article className="image2-history-card" key={item.id}>
                  <img alt={item.name} src={generatedImageSrc(item)} />
                  <div>
                    <span>{item.stage === "outfit" ? "人物穿搭图" : "视频首帧图"}</span>
                    <strong>{item.name}</strong>
                    {item.assetId ? <FeedbackBadge feedback={props.feedbackByAssetId.get(item.assetId)} /> : null}
                    <button type="button" onClick={() => props.onCopyText(item.prompt, item.id)}>
                      <Copy aria-hidden="true" />
                      复制提示词
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="image2-empty-state">还没有生成记录</div>
            )}
          </div>
          <div className="image2-shared-results">
            <div className="image2-results-toolbar">
              <strong>团队结果库</strong>
              <span>{props.sharedResults.length} 条</span>
            </div>
            <div className="image2-shared-results-grid">
              {props.sharedResults.length ? (
                props.sharedResults.slice(0, 12).map((asset) => (
                  <button
                    aria-label={`选用 ${asset.title} 作为穿搭/主图`}
                    className="image2-shared-result-card"
                    key={asset.id}
                    type="button"
                    onClick={() => props.onSelectResult(asset)}
                  >
                    <img alt={asset.title} src={localImageSrc(asset.previewPath)} />
                    <div>
                      <span>{asset.stage === "first-frame" ? "首帧图" : "穿搭图"}</span>
                      <strong>{asset.title}</strong>
                      <FeedbackBadge feedback={props.feedbackByAssetId.get(asset.id)} />
                      <small>{asset.subtitle}</small>
                      <em
                        onClick={(event) => {
                          event.stopPropagation();
                          props.onOpenFeedback(asset);
                        }}
                      >
                        反馈
                      </em>
                    </div>
                  </button>
                ))
              ) : (
                <div className="image2-empty-state">团队生成的结果会自动沉淀到这里</div>
              )}
            </div>
          </div>
        </div>
        <aside className="image2-artifact-panel">
          <strong>项目沉淀图</strong>
          <div>
            {artifactCards.map((item) => (
              <figure key={item.title}>
                <img alt={item.title} src={localImageSrc(item.path)} />
                <figcaption>{item.title}</figcaption>
              </figure>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}

function CasesView({ cases, onPreview }: { cases: WorkbenchCase[]; onPreview: (item: WorkbenchCase) => void }) {
  return (
    <section className="image2-workbench-section">
      <SectionHead title="案例参考" subtitle="从现有 Image2 案例库抽取高分案例，用来给团队找构图和提示词结构。" />
      <div className="image2-case-strip">
        {cases.map((item) => (
          <button className="image2-case-card" key={item.id} type="button" onClick={() => onPreview(item)}>
            <img alt={item.imageAlt} src={caseImageSrc(item.imageUrl)} />
            <span>{item.valueTier} · {item.valueScore}</span>
            <strong>{item.title}</strong>
            <small>{item.categoryLabel}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function FeedbackDrawer({
  assetsById,
  feedback,
  feedbackStats,
  onClose,
  onApplyPromptPatch,
  onSubmit,
  target
}: {
  assetsById: Map<string, WorkbenchAsset>;
  feedback: WorkbenchFeedback[];
  feedbackStats: Image2WorkbenchData["feedbackStats"];
  onClose: () => void;
  onApplyPromptPatch: (stage: WorkbenchPromptTemplateStage, patch: string) => void;
  onSubmit: (input: { rating: WorkbenchFeedbackRating; reasons: string[]; note: string; target: FeedbackTarget }) => Promise<void>;
  target: FeedbackTarget | null;
}) {
  const [rating, setRating] = useState<WorkbenchFeedbackRating>("usable");
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const targetAsset = target ? assetsById.get(target.assetId) : undefined;
  const targetImage = target?.src ?? (targetAsset?.previewPath ? localImageSrc(targetAsset.previewPath) : "");
  const insights = useMemo(() => buildFeedbackInsights(feedback), [feedback]);

  useEffect(() => {
    setRating("usable");
    setReasons([]);
    setNote("");
    setError("");
    setSaved("");
  }, [target?.assetId]);

  function toggleReason(reason: string) {
    setReasons((current) => (current.includes(reason) ? current.filter((item) => item !== reason) : [...current, reason]));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!target) {
      setError("生成或选择一张结果图后再提交反馈。");
      return;
    }
    setBusy(true);
    setError("");
    setSaved("");
    try {
      await onSubmit({ rating, reasons, note, target });
      setSaved("反馈已记录，我会把这些卡点用于下一轮迭代。");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "反馈保存失败。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="image2-feedback-drawer" aria-label="体验反馈">
      <button className="image2-feedback-backdrop" type="button" aria-label="关闭体验反馈" onClick={onClose} />
      <section className="image2-feedback-panel">
        <header>
          <div>
            <small>Iteration Loop</small>
            <h2>体验反馈</h2>
          </div>
          <button type="button" aria-label="关闭体验反馈" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="image2-feedback-stats">
          <div>
            <strong>{feedbackStats.total}</strong>
            <span>全部反馈</span>
          </div>
          <div>
            <strong>{feedbackStats.usable}</strong>
            <span>可用</span>
          </div>
          <div>
            <strong>{feedbackStats.needsFix}</strong>
            <span>待修</span>
          </div>
          <div>
            <strong>{feedbackStats.reject}</strong>
            <span>废图</span>
          </div>
        </div>

        <div className="image2-feedback-insights">
          <div>
            <small>下一轮优先追问</small>
            <strong>{insights.focus}</strong>
            <p>{insights.question}</p>
          </div>
          <div className="image2-feedback-reason-bars">
            {insights.reasons.length ? (
              insights.reasons.map((item) => (
                <article key={item.reason}>
                  <span>{item.reason}</span>
                  <b>{item.count}</b>
                  <i style={{ width: `${item.percent}%` }} />
                </article>
              ))
            ) : (
              <p>提交几条反馈后，这里会自动出现最该优先处理的问题。</p>
            )}
          </div>
          {insights.outfitPatch || insights.framePatch ? (
            <div className="image2-feedback-patches">
              <span>提示词补丁</span>
              <div>
                {insights.outfitPatch ? (
                  <button
                    type="button"
                    onClick={() => {
                      onApplyPromptPatch("outfit", insights.outfitPatch);
                      setSaved("已应用到人物穿搭图补充要求。");
                    }}
                  >
                    <WandSparkles aria-hidden="true" />
                    应用到穿搭备注
                  </button>
                ) : null}
                {insights.framePatch ? (
                  <button
                    type="button"
                    onClick={() => {
                      onApplyPromptPatch("first-frame", insights.framePatch);
                      setSaved("已应用到视频首帧图补充要求。");
                    }}
                  >
                    <Film aria-hidden="true" />
                    应用到首帧备注
                  </button>
                ) : null}
              </div>
              <p>{insights.outfitPatch || insights.framePatch}</p>
            </div>
          ) : null}
        </div>

        <form className="image2-feedback-form" onSubmit={submit}>
          <div className="image2-feedback-target">
            {targetImage ? <img alt={target?.name ?? "反馈目标"} src={targetImage} /> : <div />}
            <span>{target ? (target.stage === "first-frame" ? "视频首帧图" : target.stage === "outfit" ? "人物穿搭图" : "手动反馈") : "等待生成结果"}</span>
            <strong>{target?.name ?? "出图后这里会自动关联最新结果"}</strong>
          </div>

          <div className="image2-feedback-rating">
            {feedbackRatingOptions.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  className={rating === item.rating ? `active ${item.rating}` : item.rating}
                  key={item.rating}
                  type="button"
                  onClick={() => setRating(item.rating)}
                >
                  <Icon aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="image2-feedback-reasons">
            {feedbackReasons.map((reason) => (
              <button className={reasons.includes(reason) ? "active" : ""} key={reason} type="button" onClick={() => toggleReason(reason)}>
                {reason}
              </button>
            ))}
          </div>

          <label className="image2-feedback-note">
            <span>补充一句</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="比如：人物脸偏成熟，服装领口不像，场景透视可以但脚被切掉。" />
          </label>

          {error ? <p className="image2-feedback-message error">{error}</p> : null}
          {saved ? <p className="image2-feedback-message">{saved}</p> : null}

          <div className="image2-feedback-actions">
            <button type="button" onClick={onClose}>
              跳过
            </button>
            <button className="primary" disabled={busy || !target} type="submit">
              <Send aria-hidden="true" />
              {busy ? "记录中" : "提交反馈"}
            </button>
          </div>
        </form>

        <div className="image2-feedback-recent">
          <strong>最近反馈</strong>
          {feedback.slice(0, 8).length ? (
            feedback.slice(0, 8).map((item) => (
              <article key={item.id}>
                <FeedbackBadge feedback={item} />
                <span>{assetsById.get(item.assetId)?.title ?? item.assetId}</span>
                <small>{item.reasons.length ? item.reasons.join(" / ") : "未选择原因"}</small>
              </article>
            ))
          ) : (
            <p>还没有反馈。下一张生成图会自动问你。</p>
          )}
        </div>

        {insights.reworkItems.length ? (
          <div className="image2-feedback-rework">
            <strong>待修样本</strong>
            {insights.reworkItems.map((item) => (
              <article key={item.id}>
                <FeedbackBadge feedback={item} />
                <span>{assetsById.get(item.assetId)?.title ?? item.assetId}</span>
                <small>{item.reasons.length ? item.reasons.join(" / ") : item.note || "待补充原因"}</small>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </aside>
  );
}

function FeedbackBadge({ feedback }: { feedback?: WorkbenchFeedback }) {
  if (!feedback) return <span className="image2-feedback-badge muted">未反馈</span>;
  return <span className={`image2-feedback-badge ${feedback.rating}`}>{feedbackRatingLabel(feedback.rating)}</span>;
}

function WindowHead({ index, title, subtitle }: { index: string; title: string; subtitle: string }) {
  return (
    <header className="image2-window-head">
      <span>{index}</span>
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </header>
  );
}

function SectionHead({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="image2-section-head">
      <div>
        <p>Image2 Workbench</p>
        <h2>{title}</h2>
      </div>
      <span>{subtitle}</span>
    </header>
  );
}

function SelectedAssetSlot({
  asset,
  label,
  onPick,
  onPreview
}: {
  asset?: WorkbenchAsset;
  label: string;
  onPick: () => void;
  onPreview: (asset: WorkbenchAsset) => void;
}) {
  return (
    <article className={asset ? "image2-selected-slot filled" : "image2-selected-slot empty"}>
      {asset ? (
        <>
          <img alt={asset.title} src={localImageSrc(asset.previewPath)} />
          <div>
            <span>{label}</span>
            <strong>{asset.title}</strong>
            <small>{asset.subtitle}</small>
          </div>
          <div className="image2-selected-actions">
            <button type="button" onClick={() => onPreview(asset)} aria-label={`查看${asset.title}`}>
              <Maximize2 aria-hidden="true" />
              查看
            </button>
            <button type="button" onClick={onPick}>
              <Search aria-hidden="true" />
              换图
            </button>
          </div>
        </>
      ) : (
        <button className="image2-selected-empty" type="button" onClick={onPick}>
          <Plus aria-hidden="true" />
          <span>{label}</span>
          <small>点击选择</small>
        </button>
      )}
    </article>
  );
}

function GenerationStep(props: {
  copied: string;
  disabled: boolean;
  disabledReason: string;
  isLoading: boolean;
  onCopyText: (value: string, key: string) => Promise<void>;
  onGenerate: () => void;
  onOpenPrompt: () => void;
  onOpenTemplate: () => void;
  prompt: string;
  referenceCount: number;
  stepLabel: string;
  template?: WorkbenchPromptTemplate;
  title: string;
}) {
  const copyKey = `${props.title}-prompt`;
  return (
    <article className="image2-generation-step">
      <div className="image2-generation-step-head">
        <div>
          <span>{props.stepLabel}</span>
          <h3>{props.title}</h3>
          <p>{props.template?.title ?? "未选择模板"} · {props.referenceCount} 张参考图</p>
        </div>
        <div className="image2-step-head-actions">
          {props.disabled ? <em>{props.disabledReason}</em> : <em className="ready">可生成</em>}
          <button type="button" onClick={props.onOpenTemplate}>
            <Palette aria-hidden="true" />
            模板
          </button>
        </div>
      </div>
      <pre>{props.prompt}</pre>
      <div className="image2-generation-actions">
        <button type="button" onClick={props.onOpenPrompt}>
          <Eye aria-hidden="true" />
          放大检查
        </button>
        <button type="button" onClick={() => props.onCopyText(props.prompt, copyKey)}>
          <Clipboard aria-hidden="true" />
          {props.copied === copyKey ? "已复制" : "复制"}
        </button>
        <button className="primary" disabled={props.disabled || props.isLoading} type="button" onClick={props.onGenerate}>
          {props.isLoading ? <Loader2 className="spin" aria-hidden="true" /> : <WandSparkles aria-hidden="true" />}
          {props.isLoading ? "生成中" : "生成图片"}
        </button>
      </div>
    </article>
  );
}

function GeneratedPreview({ empty, image, title }: { empty: string; image?: GeneratedWorkbenchImage; title: string }) {
  return (
    <article className="image2-generated-preview">
      <span>{title}</span>
      {image ? (
        <>
          <img alt={image.name} src={generatedImageSrc(image)} />
          <strong>{image.name}</strong>
        </>
      ) : (
        <div>
          <Images aria-hidden="true" />
          <p>{empty}</p>
        </div>
      )}
    </article>
  );
}

function AssetGrid({
  assets,
  onPreview,
  onSelect,
  selectedId
}: {
  assets: WorkbenchAsset[];
  onPreview: (asset: WorkbenchAsset) => void;
  onSelect: (asset: WorkbenchAsset) => void;
  selectedId?: string;
}) {
  return (
    <div className="image2-asset-grid">
      {assets.length ? (
        assets.map((asset) => (
          <article className={selectedId === asset.id ? "image2-asset-card active" : "image2-asset-card"} key={asset.id}>
            <button className="image2-asset-select" type="button" onClick={() => onSelect(asset)}>
              <img alt={asset.title} src={localImageSrc(asset.previewPath)} />
              <span>{asset.group}</span>
              <strong>{asset.title}</strong>
              <small>{asset.subtitle}</small>
            </button>
            <button className="image2-asset-preview" type="button" onClick={() => onPreview(asset)} aria-label={`预览${asset.title}`}>
              <Maximize2 aria-hidden="true" />
            </button>
          </article>
        ))
      ) : (
        <div className="image2-empty-state">没有匹配素材</div>
      )}
    </div>
  );
}

function TemplateColumn(props: {
  activeId: string;
  note: string;
  onNoteChange: (value: string) => void;
  onSelect: (id: string) => void;
  stage: WorkbenchPromptTemplateStage;
  templates: WorkbenchPromptTemplate[];
  title: string;
}) {
  return (
    <article className="image2-template-column">
      <h3>{props.title}</h3>
      <div>
        {props.templates.map((item) => (
          <button
            className={props.activeId === item.id ? "active" : ""}
            key={item.id}
            type="button"
            onClick={() => props.onSelect(item.id)}
          >
            <strong>{item.title}</strong>
            <span>{item.summary}</span>
          </button>
        ))}
      </div>
      <label>
        <span>{props.stage === "outfit" ? "穿搭图补充要求" : "首帧图补充要求"}</span>
        <textarea value={props.note} onChange={(event) => props.onNoteChange(event.target.value)} />
      </label>
    </article>
  );
}

function AssetPreviewModal({
  asset,
  onClose,
  onSelect
}: {
  asset: WorkbenchAsset;
  onClose: () => void;
  onSelect: (asset: WorkbenchAsset) => void;
}) {
  return (
    <ModalShell title={asset.title} kicker={`${asset.group} · ${asset.id}`} onClose={onClose}>
      <div className="image2-asset-modal">
        <img alt={asset.title} src={localImageSrc(asset.previewPath)} />
        <div>
          <p>{asset.note}</p>
          <small>{asset.promptHint}</small>
          <div className="image2-tag-row">{asset.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
          <button
            className="image2-modal-primary"
            type="button"
            onClick={() => {
              onSelect(asset);
              onClose();
            }}
          >
            <Check aria-hidden="true" />
            选入当前流程
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function TemplatePickerModal({
  activeId,
  onClose,
  onSelect,
  stage,
  templates
}: {
  activeId: string;
  onClose: () => void;
  onSelect: (id: string) => void;
  stage: WorkbenchPromptTemplateStage;
  templates: WorkbenchPromptTemplate[];
}) {
  return (
    <ModalShell title={stage === "outfit" ? "选择人物穿搭图模板" : "选择视频首帧图模板"} kicker="Prompt Template" onClose={onClose}>
      <div className="image2-template-picker">
        {templates.map((item) => (
          <button className={activeId === item.id ? "active" : ""} key={item.id} type="button" onClick={() => onSelect(item.id)}>
            <strong>{item.title}</strong>
            <span>{item.summary}</span>
            <p>{item.prompt}</p>
          </button>
        ))}
      </div>
    </ModalShell>
  );
}

function PromptModal({
  copied,
  onClose,
  onCopyText,
  prompt,
  title
}: {
  copied: string;
  onClose: () => void;
  onCopyText: (value: string, key: string) => Promise<void>;
  prompt: string;
  title: string;
}) {
  return (
    <ModalShell title={title} kicker="Prompt Check" onClose={onClose}>
      <div className="image2-prompt-modal">
        <pre>{prompt}</pre>
        <button type="button" onClick={() => onCopyText(prompt, title)}>
          <Copy aria-hidden="true" />
          {copied === title ? "已复制" : "复制完整提示词"}
        </button>
      </div>
    </ModalShell>
  );
}

function CasePreviewModal({ caseItem, onClose }: { caseItem: WorkbenchCase; onClose: () => void }) {
  return (
    <ModalShell title={caseItem.title} kicker={`${caseItem.categoryLabel} · ${caseItem.valueTier}`} onClose={onClose}>
      <div className="image2-case-modal">
        <img alt={caseItem.imageAlt} src={caseImageSrc(caseItem.imageUrl)} />
        <div>
          <strong>{caseItem.valueScore} 分参考案例</strong>
          <p>{caseItem.promptPreview}</p>
          <a href="/image2-cases">
            <ExternalLink aria-hidden="true" />
            打开完整案例库
          </a>
        </div>
      </div>
    </ModalShell>
  );
}

function AssetUploadModal({
  defaultKind,
  onClose,
  onUploaded
}: {
  defaultKind: WorkbenchAssetKind;
  onClose: () => void;
  onUploaded: (asset: WorkbenchAsset) => Promise<void>;
}) {
  const [kind, setKind] = useState<WorkbenchAssetKind>(defaultKind);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setKind(defaultKind);
  }, [defaultKind]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setError("先选一张图片再上传。");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kind", kind);
      formData.append("title", title.trim());
      formData.append("note", note.trim());
      formData.append("tags", tags.trim());
      const response = await fetch("/api/image2-workbench/assets", {
        method: "POST",
        body: formData
      });
      const payload = (await response.json()) as { asset?: WorkbenchAsset; error?: string };
      if (!response.ok || !payload.asset) throw new Error(payload.error ?? "上传失败。");
      await onUploaded(payload.asset);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "上传失败。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="上传团队素材" kicker="Asset Upload" onClose={onClose}>
      <form className="image2-upload-modal" onSubmit={submit}>
        <div className="image2-upload-grid">
          <label>
            <span>分类</span>
            <select value={kind} onChange={(event) => setKind(event.target.value as WorkbenchAssetKind)}>
              {assetKindOptions.map((item) => (
                <option key={item.kind} value={item.kind}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>标题</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="上传后显示的名称" />
          </label>
          <label className="wide">
            <span>备注</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="比如：适合哪类场景、为什么值得保留。" />
          </label>
          <label className="wide">
            <span>标签</span>
            <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="人物, 白底, 返图" />
          </label>
          <label className="wide">
            <span>图片文件</span>
            <input
              accept="image/png,image/jpeg,image/webp"
              type="file"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        {file ? (
          <div className="image2-upload-preview">
            {previewUrl ? <img alt={file.name} src={previewUrl} /> : <div aria-hidden="true" className="image2-upload-preview-empty" />}
            <div>
              <strong>{file.name}</strong>
              <small>{Math.round(file.size / 1024)} KB</small>
            </div>
          </div>
        ) : null}

        {error ? <p className="image2-upload-error">{error}</p> : null}

        <div className="image2-upload-actions">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary" disabled={busy} type="submit">
            {busy ? "上传中" : "保存到共享库"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function ModalShell({
  children,
  kicker,
  onClose,
  title
}: {
  children: ReactNode;
  kicker: string;
  onClose: () => void;
  title: string;
}) {
  return (
    <section className="image2-modal-layer" aria-label={title}>
      <button className="image2-modal-backdrop" type="button" aria-label="关闭弹窗" onClick={onClose} />
      <div className="image2-modal-panel" role="dialog" aria-modal="true">
        <header>
          <div>
            <small>{kicker}</small>
            <h2>{title}</h2>
          </div>
          <button type="button" aria-label="关闭弹窗" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        {children}
      </div>
    </section>
  );
}

function generatedImageSrc(image: GeneratedWorkbenchImage) {
  return image.src || image.dataUrl || "";
}

function initialSelections(assets: WorkbenchAsset[]) {
  return assetKindOptions.reduce(
    (acc, item) => ({
      ...acc,
      [item.kind]: assets.find((asset) => asset.kind === item.kind)?.id ?? ""
    }),
    {} as Record<WorkbenchAssetKind, string>
  );
}

function firstTemplateId(templates: WorkbenchPromptTemplate[], stage: WorkbenchPromptTemplateStage) {
  return templates.find((item) => item.stage === stage)?.id ?? "";
}

function findTemplate(templates: WorkbenchPromptTemplate[], id: string, stage: WorkbenchPromptTemplateStage) {
  return templates.find((item) => item.id === id) ?? templates.find((item) => item.stage === stage);
}

function groupAssetsByKind(assets: WorkbenchAsset[]) {
  return assetKindOptions.reduce(
    (acc, item) => ({
      ...acc,
      [item.kind]: assets.filter((asset) => asset.kind === item.kind)
    }),
    {} as Record<WorkbenchAssetKind, WorkbenchAsset[]>
  );
}

function latestFeedbackByAssetId(feedback: WorkbenchFeedback[]) {
  const byId = new Map<string, WorkbenchFeedback>();
  for (const item of feedback) {
    const current = byId.get(item.assetId);
    if (!current || Date.parse(item.createdAt) > Date.parse(current.createdAt)) byId.set(item.assetId, item);
  }
  return byId;
}

function feedbackRatingLabel(rating: WorkbenchFeedbackRating) {
  if (rating === "usable") return "可用";
  if (rating === "needs-fix") return "待修";
  return "废图";
}

function buildFeedbackInsights(feedback: WorkbenchFeedback[]) {
  const actionable = feedback.filter((item) => item.rating !== "usable");
  const reasonCounts = new Map<string, number>();
  for (const item of actionable) {
    const reasons = item.reasons.length ? item.reasons : ["其他"];
    for (const reason of reasons) reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }
  const maxCount = Math.max(1, ...reasonCounts.values());
  const reasons = [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => ({
      count,
      percent: Math.max(12, Math.round((count / maxCount) * 100)),
      reason
    }));
  const topReason = reasons[0]?.reason;
  const focus = topReason ? `${topReason} 优先` : "先收集 3 条真实反馈";
  const question = topReason
    ? feedbackQuestionForReason(topReason)
    : "下一轮出图后，我会先问你这张图是可用、待修还是废图，再记录具体原因。";
  const topReasons = reasons.map((item) => item.reason);
  return {
    focus,
    framePatch: buildPromptPatch(topReasons, "first-frame"),
    outfitPatch: buildPromptPatch(topReasons, "outfit"),
    question,
    reasons,
    reworkItems: actionable.slice(0, 5)
  };
}

function feedbackQuestionForReason(reason: string) {
  const questions: Record<string, string> = {
    人物不像: "下一轮我会重点问：脸型、发型、年龄感，哪个最先失真？",
    服装不准: "下一轮我会重点问：版型、颜色、材质、领口袖口，哪一处最影响复用？",
    场景不融合: "下一轮我会重点问：光线、透视、人物落地感，哪一项最不自然？",
    构图不适合动作迁移: "下一轮我会重点问：人物是否全身可见、运动方向是否留白、头手脚有没有被切。",
    "手脚/肢体问题": "下一轮我会重点问：手、脚、腿部比例、身体姿态，哪个最需要约束。",
    "画质/水印文字": "下一轮我会重点问：是清晰度不够、纹理脏，还是出现文字水印。",
    操作流程卡点: "下一轮我会重点问：你卡在哪一步，是找图、选模板、上传，还是结果复用。",
    其他: "下一轮我会让你补一句具体问题，然后把它沉淀成新的原因标签。"
  };
  return questions[reason] ?? questions["其他"];
}

function buildPromptPatch(reasons: string[], stage: WorkbenchPromptTemplateStage) {
  const patches = reasons
    .map((reason) => feedbackPromptPatchForReason(reason)[stage])
    .filter((patch): patch is string => Boolean(patch));
  return [...new Set(patches)].slice(0, 3).join(" ");
}

function feedbackPromptPatchForReason(reason: string): Partial<Record<WorkbenchPromptTemplateStage, string>> {
  const patches: Record<string, Partial<Record<WorkbenchPromptTemplateStage, string>>> = {
    人物不像: {
      outfit: "强化人物身份一致性：保留脸型、五官比例、发型、年龄感和整体气质，不改变人物身份。",
      "first-frame": "首帧必须延续穿搭图中的人物身份、脸型、发型和年龄感，不重新生成另一张脸。"
    },
    服装不准: {
      outfit: "强化服装还原：准确保留领口、袖口、版型、颜色、材质纹理和褶皱结构。",
      "first-frame": "首帧必须延续穿搭图服装结构和颜色，不改变领口袖口、材质和版型。"
    },
    场景不融合: {
      "first-frame": "强化场景融合：人物脚底接地自然，光线方向、阴影、透视和景深与场景一致。"
    },
    构图不适合动作迁移: {
      "first-frame": "强化动作迁移构图：人物全身清晰入镜，头手脚完整，身体周围留出运动空间和方向留白。"
    },
    "手脚/肢体问题": {
      outfit: "强化肢体稳定：手指、手臂、腿部比例自然，避免畸形、粘连、缺失或多余肢体。",
      "first-frame": "首帧肢体必须完整自然，手脚清晰可见，避免切边、畸形、粘连和多余肢体。"
    },
    "画质/水印文字": {
      outfit: "画质要求：真实摄影质感，高清干净，无文字、无水印、无Logo、无脏污伪影。",
      "first-frame": "画质要求：真实摄影质感，高清干净，无文字、无水印、无Logo、无脏污伪影。"
    },
    操作流程卡点: {
      "first-frame": "流程约束：优先生成可直接进入动作迁移的工作底稿，主体、服装、场景关系清楚可复盘。"
    },
    其他: {
      outfit: "根据上一轮反馈优先保证主体清晰、身份稳定和服装可读性。",
      "first-frame": "根据上一轮反馈优先保证首帧可迁移、主体完整和画面可复盘。"
    }
  };
  return patches[reason] ?? patches["其他"];
}

function filterAssets(assets: WorkbenchAsset[], query: string) {
  const text = query.trim().toLowerCase();
  if (!text) return assets;
  return assets.filter((asset) =>
    [asset.title, asset.subtitle, asset.note, asset.promptHint, ...asset.tags].join(" ").toLowerCase().includes(text)
  );
}

function buildPrompt(
  template: WorkbenchPromptTemplate | undefined,
  vars: { clothing: string; motion: string; note: string; outfit: string; person: string; scene: string }
) {
  const base = (template?.prompt || "")
    .replaceAll("{{person}}", vars.person)
    .replaceAll("{{clothing}}", vars.clothing)
    .replaceAll("{{outfit}}", vars.outfit)
    .replaceAll("{{scene}}", vars.scene)
    .replaceAll("{{motion}}", vars.motion);
  return [
    base,
    vars.note ? `补充要求：${vars.note}` : "",
    "统一质量要求：9:16 竖版优先，人物清晰，服装结构准确，真实摄影质感，无文字，无水印，无多余人物，无畸形手脚。"
  ]
    .filter(Boolean)
    .join("\n\n");
}

function localImageSrc(filePath: string) {
  if (!filePath || filePath.startsWith("/") || /^https?:\/\//i.test(filePath)) {
    return filePath;
  }
  return `/api/image2-workbench/file?path=${encodeURIComponent(filePath)}`;
}

function caseImageSrc(value: string) {
  if (!value || value.startsWith("/")) return value;
  return `/api/image2/proxy?url=${encodeURIComponent(value)}`;
}
