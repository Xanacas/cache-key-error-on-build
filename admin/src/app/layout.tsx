import type { Metadata } from "next";
import { cookies } from "next/headers";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "API Proxy Admin",
  description: "Administration panel for the API Proxy system",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const session = cookieStore.get("admin_session")?.value;
  const isLoggedIn = !!session;

  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-900 text-zinc-100 antialiased font-mono">
        {isLoggedIn && <Sidebar />}
        <main className={isLoggedIn ? "ml-[250px] min-h-screen" : "min-h-screen"}>
          <div className="mx-auto max-w-7xl px-6 py-8">{children}</div>
        </main>
      </body>
    </html>
  );
}
