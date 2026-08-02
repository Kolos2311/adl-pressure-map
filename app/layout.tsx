import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ADL Pressure Map",
  description:
    "Приближённая карта риска Auto-Deleveraging (ADL) для бессрочных контрактов Bybit — эвристическая визуализация, не официальные данные биржи.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
