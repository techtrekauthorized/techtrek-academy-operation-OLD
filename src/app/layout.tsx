import type { Metadata } from "next";
import "./globals.css";
import { I18nProvider } from "@/i18n/I18nProvider";

export const metadata: Metadata = {
  title: { default: "TechTrek Academy Operations", template: "%s | TechTrek Ops" },
  description: "Internal academy operations system for TechTrek staff.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" dir="ltr" suppressHydrationWarning><body><I18nProvider>{children}</I18nProvider></body></html>;
}
