"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/ui/shell";

const quickLinks = [
  ["Đi tới Facebook Pages", "/facebook-pages"],
  ["Đi tới Inbox", "/inbox"],
  ["Đi tới AI", "/ai"],
  ["Đi tới Campaign", "/campaigns"],
  ["Đi tới Bình luận", "/comments"],
  ["Đi tới Sản phẩm", "/products"],
  ["Đi tới Nhật ký", "/logs"]
];

const sections = [
  ["Tổng quan", "SalesBot AI gom Facebook Pages, Inbox, bình luận, lead, đơn hàng, sản phẩm, automation và campaign vào một màn hình vận hành bán hàng."],
  ["Kết nối Facebook", "Vào Facebook Pages, bấm Kết nối với Facebook, chọn Page cần quản lý, sau đó kiểm tra quyền Messenger, comment và webhook."],
  ["Facebook Pages", "Mỗi Page có token, webhook, automation, AI provider, prompt, kiến thức và chat rules riêng. Không dùng chung context giữa các Page."],
  ["Inbox", "Inbox hiển thị hội thoại theo Page, trạng thái AI, human takeover, lead score, SĐT, địa chỉ, sản phẩm quan tâm và lịch sử tin nhắn."],
  ["Gộp nhiều Page", "Bộ lọc Page trong Inbox và Campaign giúp xem tất cả Page hoặc tách riêng từng Page. PSID giống nhau ở Page khác vẫn là hội thoại riêng."],
  ["AI Auto Reply", "AI chỉ trả lời khi Page bật automation, Messenger, AI sales mode và cuộc chat chưa bị human takeover."],
  ["OpenAI", "Cấu hình OPENAI_API_KEY ở server. Chọn OpenAI và model trong Cài đặt Page nếu Page đó muốn dùng OpenAI."],
  ["Gemini", "Cấu hình GEMINI_API_KEY ở server. Chọn Gemini và model trong Cài đặt Page nếu Page đó muốn dùng Gemini."],
  ["Human Takeover", "Bấm Nhân viên tiếp quản để tắt AI cho cuộc chat. Khi nhân viên gửi thủ công, hệ thống tự ưu tiên human takeover nếu Page bật auto handoff."],
  ["Khách hàng", "Thông tin khách được cập nhật từ hội thoại, lead và dữ liệu đã thu thập."],
  ["Lead", "Lead lưu SĐT, địa chỉ, nhu cầu, điểm lead, Page và nguồn phát sinh."],
  ["Đơn hàng", "Đơn hàng dùng dữ liệu lead đã đủ SĐT, địa chỉ, sản phẩm và số lượng. AI không tự bịa giá khi thiếu dữ liệu."],
  ["Sản phẩm", "Sản phẩm là nguồn dữ liệu để AI tư vấn, tính độ phủ và trả lời giá khi có giá chính thức."],
  ["Bình luận", "Màn Bình luận theo dõi comment đã ẩn, đã like, đã reply và kết quả automation."],
  ["Auto Like Comment", "Bật trong Page Settings để tự like bình luận hợp lệ khi Page có quyền pages_manage_engagement."],
  ["Auto Reply Comment", "Tự trả lời comment theo rule. Không trả lời comment do chính Page gửi."],
  ["Auto Hide Comment", "Ẩn comment theo chế độ của từng Page."],
  ["Ẩn tất cả bình luận", "Chọn hide_all nếu muốn ẩn mọi bình luận mới trên Page."],
  ["Ẩn bình luận có SĐT", "Chọn phone_only để chỉ ẩn comment chứa số điện thoại Việt Nam."],
  ["Ẩn theo từ khóa", "Chọn blocked_keywords và nhập từng từ khóa trong Cài đặt Page."],
  ["Campaign", "Tạo segment khách, xem preview, chọn người nhận đủ điều kiện, soạn mẫu hoặc dùng AI copy rồi gửi trong cửa sổ Messenger hợp lệ."],
  ["Đồng bộ lịch sử", "Bấm Đồng bộ lịch sử ở Inbox để import hội thoại cũ hoặc khôi phục dữ liệu từ Facebook theo Page hoặc tất cả Page."],
  ["Chăm sóc khách chưa có SĐT", "Trong Campaign chọn Chưa có SĐT để tạo danh sách khách cần xin số điện thoại."],
  ["Chăm sóc khách chưa có địa chỉ", "Trong Campaign chọn Chưa có địa chỉ để tiếp tục thu thập thông tin giao hàng."],
  ["Campaign eligibility", "Khách chỉ eligible khi có Page, PSID và tin nhắn khách trong 24 giờ gần nhất theo chính sách Messenger."],
  ["Cài đặt từng Page", "Mỗi Page lưu provider, model, fallback, system prompt, kiến thức, fallback message, delay và chat rules riêng."],
  ["Kiểm tra kết nối", "Trong Facebook Pages bấm Kiểm tra kết nối để kiểm tra Page token, Messenger, webhook và quyền comment."],
  ["Đồng bộ Page", "Bấm Đồng bộ để cập nhật thông tin Page và trạng thái kết nối."],
  ["Ngắt kết nối", "Ngắt kết nối tắt automation và bỏ token Page, nhưng lịch sử hội thoại vẫn được giữ."],
  ["Nhật ký", "Nhật ký lưu các sự kiện cấu hình, Page, đơn hàng và lỗi vận hành quan trọng."],
  ["Lỗi thường gặp", "Page Token hết hạn, thiếu quyền comment, webhook chưa đăng ký, OpenAI/Gemini chưa cấu hình hoặc ngoài cửa sổ 24 giờ Messenger."],
  ["Bảo mật/API key", "API key OpenAI, Gemini, Facebook token và Supabase service key chỉ dùng server-side, không render xuống browser."]
];

const checklist = ["Supabase", "Facebook App", "Webhook", "Facebook Page", "Messenger", "Comment permission", "OpenAI/Gemini", "Test message", "Test comment"];

export default function HelpPage() {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sections.filter(([title, body]) => !needle || `${title} ${body}`.toLowerCase().includes(needle));
  }, [query]);
  return (
    <AppShell title="Hướng dẫn" subtitle="Tra cứu nhanh cách thiết lập và vận hành SalesBot AI.">
      <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
        <aside className="panel rounded-lg p-4">
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full rounded-md border border-line px-3 py-2 text-sm" placeholder="Tìm hướng dẫn..." />
          <div className="mt-4 space-y-1">
            {filtered.map(([title]) => (
              <a key={title} href={`#${slug(title)}`} className="block rounded-md px-2 py-1.5 text-sm hover:bg-slate-100">
                {title}
              </a>
            ))}
          </div>
        </aside>
        <main className="space-y-4">
          <section className="panel rounded-lg p-4">
            <h2 className="font-semibold">Checklist setup ban đầu</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {checklist.map((item) => (
                <div key={item} className="rounded-md border border-line px-3 py-2 text-sm">
                  <span className="mr-2 text-leaf">✓</span>
                  {item}
                </div>
              ))}
            </div>
          </section>
          <section className="panel rounded-lg p-4">
            <h2 className="font-semibold">Link nhanh</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {quickLinks.map(([label, href]) => (
                <Link key={href} href={href} className="rounded-md border border-line px-3 py-2 text-sm hover:bg-slate-50">
                  {label}
                </Link>
              ))}
            </div>
          </section>
          {filtered.map(([title, body], index) => (
            <details key={title} id={slug(title)} className="panel rounded-lg p-4" open={index < 4}>
              <summary className="cursor-pointer font-semibold">{title}</summary>
              <div className="mt-3 space-y-3 text-sm leading-6 text-slate-700">
                <p>{body}</p>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>Mở đúng màn hình liên quan.</li>
                  <li>Kiểm tra trạng thái, quyền và dữ liệu Page.</li>
                  <li>Lưu cấu hình rồi thử bằng tin nhắn hoặc comment thật.</li>
                </ol>
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">Lưu ý: không nhập API key vào ô hiển thị cho người dùng; key chỉ đặt trong biến môi trường server.</div>
                <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-green-800">Mẹo: sau khi đổi cấu hình Page, gửi thử một tin nhắn mới để kiểm tra đúng provider và prompt.</div>
              </div>
            </details>
          ))}
        </main>
      </div>
    </AppShell>
  );
}

function slug(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
