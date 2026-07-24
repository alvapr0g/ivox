import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VOX — Vox Imperii",
  description: "Dictado local, privado y preciso para trabajar con IA.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
