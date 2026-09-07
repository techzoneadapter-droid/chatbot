import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Paint Sales Chatbot",
  description: "Vietnamese AI sales chatbot and lead dashboard for paint companies"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
