import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { DbProvider } from "@/components/DbProvider";
import { ActiveOfficeProvider } from "@/components/ActiveOfficeProvider";
import { AppShell } from "@/components/AppShell";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Petrafi",
  description: "Trucking sales & CRM",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} h-full antialiased`}>
        <DbProvider>
          <ActiveOfficeProvider>
            <AppShell>{children}</AppShell>
          </ActiveOfficeProvider>
        </DbProvider>
      </body>
    </html>
  );
}
