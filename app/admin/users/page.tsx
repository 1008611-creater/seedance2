import type { Metadata } from "next";
import { ArrowLeft, UsersRound } from "lucide-react";
import { AdminUsersConsole } from "@/components/admin-users-console";

export const metadata: Metadata = {
  title: "统一用户管理 - Image2 后台",
  description: "查看 Image2 与场景引擎统一账号、最近登录和图片余额。"
};

export default function AdminUsersPage() {
  return (
    <main className="admin-hub">
      <section className="admin-hub-panel" aria-label="统一用户管理入口">
        <span className="admin-hub-kicker">
          <UsersRound aria-hidden="true" />
          统一账号
        </span>
        <h1>用户管理后台</h1>
        <p>先用现有后台口令读取统一账号数据库；这里集中看邮箱、手机号、来源站点、最近登录和图片余额。</p>
        <a className="admin-hub-return" href="/admin">
          <ArrowLeft aria-hidden="true" />
          返回后台入口
        </a>
      </section>

      <AdminUsersConsole />
    </main>
  );
}
