import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { CHROME_TOKENS } from "./config/tokens";

const inter = Inter({ subsets: ["latin"] });

// Use environment variables for Vercel, fallback to local tokens for localhost
const getTokens = () => {
  const isVercel = process.env.VERCEL === '1';
  
  if (isVercel) {
    return [
      process.env.NEXT_PUBLIC_CHROME_SUMMARIZER_TOKEN,
      process.env.NEXT_PUBLIC_CHROME_TRANSLATOR_TOKEN,
      process.env.NEXT_PUBLIC_CHROME_LANGUAGE_DETECTOR_TOKEN,
    ].filter((token): token is string => typeof token === 'string');
  }

  return [
    CHROME_TOKENS.SUMMARIZER,
    CHROME_TOKENS.TRANSLATOR,
    CHROME_TOKENS.LANGUAGE_DETECTOR,
  ];
};

export const metadata: Metadata = {
  title: "AI Text Processor",
  description: "Process text using Chrome's AI APIs",
  other: {
    "origin-trial": getTokens(),
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
