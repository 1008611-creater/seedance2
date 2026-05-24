import type { Metadata } from "next";
import { CreatorApp } from "@/components/creator-app";

export const metadata: Metadata = {
  title: "Seedance 视频创作台",
  description: "原 Seedance 2.0 视频生成、队列、额度和成片库入口"
};

export default function VideoStudioPage() {
  return <CreatorApp />;
}

