import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { CHROME_TOKENS } from "./config/tokens";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AI Text Processor",
  description: "Process text using Chrome's AI APIs",
  other: {
    "origin-trial": [
      CHROME_TOKENS.SUMMARIZER,
      CHROME_TOKENS.TRANSLATOR,
      CHROME_TOKENS.LANGUAGE_DETECTOR,
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
