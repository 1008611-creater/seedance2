export const VIDEO_MODES = [
  {
    value: "text",
    label: "文生视频",
    hint: "只输入提示词"
  },
  {
    value: "first-frame",
    label: "首帧图生",
    hint: "上传 1 张图"
  },
  {
    value: "first-last",
    label: "首尾帧",
    hint: "上传 2 张图"
  },
  {
    value: "references",
    label: "参考素材",
    hint: "图/视频/音频"
  }
] as const;

export const RATIO_OPTIONS = [
  { value: "adaptive", label: "智能比例", size: "自适应", use: "默认" },
  { value: "16:9", label: "横版", size: "16:9", use: "B站/YouTube" },
  { value: "9:16", label: "竖版", size: "9:16", use: "抖音/视频号" },
  { value: "1:1", label: "方形", size: "1:1", use: "信息流" },
  { value: "4:3", label: "经典横版", size: "4:3", use: "故事片" },
  { value: "3:4", label: "小红书竖图", size: "3:4", use: "封面友好" },
  { value: "21:9", label: "电影宽银幕", size: "21:9", use: "横向大片" }
] as const;

export const DURATION_OPTIONS = [
  { value: 4, label: "4 秒", hint: "镜头测试" },
  { value: 5, label: "5 秒", hint: "快速预览" },
  { value: 8, label: "8 秒", hint: "短视频片段" },
  { value: 10, label: "10 秒", hint: "标准成片" },
  { value: 15, label: "15 秒", hint: "周卡满血" },
  { value: -1, label: "智能时长", hint: "模型决定" }
] as const;

export type VideoMode = (typeof VIDEO_MODES)[number]["value"];
export type VideoRatio = (typeof RATIO_OPTIONS)[number]["value"];
export type VideoDuration = (typeof DURATION_OPTIONS)[number]["value"];
export type VideoResolution = "720p";
export type GenerationStatus = "queued" | "running" | "succeeded" | "failed" | "expired";
export type AssetKind = "image" | "video" | "audio";
export type AssetRole = "first_frame" | "last_frame" | "reference_image" | "reference_video" | "reference_audio";

export type MediaAsset = {
  id: string;
  name: string;
  kind: AssetKind;
  role: AssetRole;
  mimeType: string;
  size: number;
  dataUrl?: string;
  url?: string;
};

export type UserProfile = {
  id: string;
  email?: string;
  displayName: string;
  createdAt: string;
  claimedTrialAt?: string;
};

export type LicenseCode = {
  id: string;
  codeHash: string;
  plan: "weekly_free";
  maxRedemptions: number;
  redeemedBy: string[];
  expiresAt?: string;
  createdAt: string;
};

export type Entitlement = {
  id: string;
  userId: string;
  plan: "weekly_free";
  startsAt: string;
  endsAt: string;
  dailyLimit: number;
  resolution: VideoResolution;
  maxDurationSeconds: 15;
  createdAt: string;
};

export type DailyUsage = {
  id: string;
  userId: string;
  usageDate: string;
  usedCount: number;
  limitCount: number;
  updatedAt: string;
};

export type Generation = {
  id: string;
  userId: string;
  title: string;
  prompt: string;
  mode: VideoMode;
  ratio: VideoRatio;
  durationSeconds: VideoDuration;
  resolution: VideoResolution;
  style?: string;
  seed?: number;
  generateAudio: boolean;
  privacy: "private" | "link";
  assets: MediaAsset[];
  status: GenerationStatus;
  progress: number;
  provider: "mock" | "seedance";
  providerTaskId?: string;
  coverUrl: string;
  videoUrl?: string;
  lastFrameUrl?: string;
  errorMessage?: string;
  refundedAt?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type QuotaSummary = {
  active: boolean;
  used: number;
  limit: number;
  remaining: number;
  resetAt: string;
};

export type DashboardResponse = {
  user: UserProfile;
  entitlement?: Entitlement;
  quota: QuotaSummary;
  jobs: Generation[];
  gallery: Generation[];
  providerMode: "mock" | "seedance";
  ratios: typeof RATIO_OPTIONS;
  durations: typeof DURATION_OPTIONS;
  modes: typeof VIDEO_MODES;
};

export type CreateGenerationInput = {
  userId: string;
  prompt: string;
  mode: VideoMode;
  ratio: VideoRatio;
  durationSeconds: VideoDuration;
  resolution: VideoResolution;
  style?: string;
  seed?: number;
  generateAudio?: boolean;
  privacy?: "private" | "link";
  assets?: MediaAsset[];
};
