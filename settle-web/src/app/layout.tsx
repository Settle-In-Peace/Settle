import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navigation from "../components/Navigation";
import Footer from "../components/Footer";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Settle In Peace — Compare Debt Relief Providers Side-by-Side",
  description: "The first marketplace for debt relief. Take a free 2-minute assessment, compare vetted providers with transparent fees, and choose your path to financial peace. No pressure, no obligation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* next-themes' inline theme script is transpiled by Turbopack, which
            injects an __name() helper that doesn't exist in raw inline script
            context — define a no-op shim so the script doesn't crash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "window.__name||(window.__name=function(f){return f})",
          }}
        />
        <Providers>
          <Navigation />
          {children}
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
