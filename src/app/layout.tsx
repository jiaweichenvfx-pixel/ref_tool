import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Canvas Drop",
  description: "PureRef-style infinite canvas with video support",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full bg-[#2b2b2f] text-zinc-100 font-sans">
        {children}
      </body>
    </html>
  );
}
