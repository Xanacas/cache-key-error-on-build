import type { Metadata } from "next";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "API Proxy Admin",
  description: "Administration panel for the API Proxy system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-900 text-zinc-100 antialiased font-mono">
        <Sidebar />
        <main className="ml-[250px] min-h-screen">
          <div className="mx-auto max-w-7xl px-6 py-8">{children}</div>
        </main>
      </body>
    </html>
  );
}
