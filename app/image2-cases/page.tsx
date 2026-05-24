import type { Metadata } from "next";
import { Image2CaseLibrary } from "@/components/image2-case-library";

export const metadata: Metadata = {
  title: "Image2 案例灵感库",
  description: "GPT-Image2 高价值案例、图片分类、提示词记录与同款生成入口"
};

export default function Image2CasesPage() {
  return <Image2CaseLibrary />;
}
