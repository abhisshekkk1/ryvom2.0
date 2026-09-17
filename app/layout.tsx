import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ryvom — Coach Dashboard",
  description: "Online coaching check-ins and client progress dashboard.",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Ryvom" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-[#09090b] text-zinc-100">{children}</body>
    </html>
  );
}
