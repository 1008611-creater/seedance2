import type { Metadata } from "next";
import { ArrowRight, ClipboardList, History, Images, LayoutGrid, Sparkles, WandSparkles } from "lucide-react";
import { AdminImage2CaseChanges } from "@/components/admin-image2-case-changes";
import { AdminSessionGate } from "@/components/admin-session-gate";

export const metadata: Metadata = {
  title: "Image2 案例库运营入口",
  description: "检查 Image2 案例库、作图中控台、同款抽卡和案例运营任务。"
};

const opsCards = [
  {
    href: "/image2-cases",
    icon: Images,
    label: "公开页面",
    title: "案例库展示",
    note: "检查案例检索、详情弹层、提示词复制和同款生成入口。"
  },
  {
    href: "/workbench",
    icon: WandSparkles,
    label: "作图工具",
    title: "作图中控台",
    note: "检查素材矩阵、提示词模板、生成结果托盘和反馈路径。"
  },
  {
    href: "/image2-cases/gacha",
    icon: Sparkles,
    label: "扩展玩法",
    title: "同款抽卡",
    note: "检查收藏图抽卡、九抽开包和配方保存路径。"
  },
  {
    href: "#change-log",
    icon: History,
    label: "安全操作",
    title: "变更记录",
    note: "查看用户资产快照的最近变更，并对误操作执行撤销。"
  },
  {
    href: "/admin/seedance",
    icon: ClipboardList,
    label: "旧后台",
    title: "Seedance 制作队列",
    note: "保留原视频任务后台，和 Image2 案例库运营分开维护。"
  }
];

export default function AdminImage2CasesPage() {
  return (
    <AdminSessionGate returnTo="/admin/image2-cases">
      <main className="admin-hub">
        <section className="admin-hub-panel" aria-label="Image2 案例库运营入口">
        <span className="admin-hub-kicker">
          <LayoutGrid aria-hidden="true" />
          Image2 案例库
        </span>
        <h1>Image2 案例库运营入口</h1>
        <p>这里先作为安全的运营入口页，避免把其他后台误投到案例库域名。后续的变更记录、撤销和案例管理功能应在这一入口下继续扩展。</p>

        <div className="admin-hub-grid">
          {opsCards.map((item, index) => {
            const Icon = item.icon;
            return (
              <a className={`admin-hub-card ${index === 0 ? "primary" : ""}`} href={item.href} key={item.href}>
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
                <strong>{item.title}</strong>
                <small>{item.note}</small>
              </a>
            );
          })}
        </div>

        <a className="admin-hub-return" href="/admin">
          <ArrowRight aria-hidden="true" />
          返回后台入口
        </a>
        </section>

        <div id="change-log">
          <AdminImage2CaseChanges />
        </div>
      </main>
    </AdminSessionGate>
  );
}
