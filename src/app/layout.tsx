import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono, Playfair_Display } from "next/font/google";
import { Sidebar } from "@/components/Sidebar";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: "Trinity",
  description: "Visual client for Claude Code workflows",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${jetbrainsMono.variable} ${playfairDisplay.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem("trinity-theme");if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}})()` }} />
      </head>
      <body className="antialiased flex">
        <Sidebar />
        <main className="flex-1 min-w-0">{children}</main>
      </body>
    </html>
  );
}
