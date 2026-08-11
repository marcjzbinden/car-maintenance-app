import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeSync } from "@/components/ui/ThemeSync";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Car Maintenance App",
  description: "A digital glovebox for vehicles and maintenance.",
};

const themeInitializationScript = `
  (function () {
    var preference = "system";

    try {
      var storedPreference = window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
      if (storedPreference === "system" || storedPreference === "light" || storedPreference === "dark") {
        preference = storedPreference;
      }
    } catch (error) {}

    var resolvedTheme = preference === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : preference;

    document.documentElement.dataset.themePreference = preference;
    document.documentElement.dataset.theme = resolvedTheme;
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitializationScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeSync />
        {children}
      </body>
    </html>
  );
}
