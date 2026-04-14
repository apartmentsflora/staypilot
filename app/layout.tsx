import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StayPilot · Flora & Lazur",
  description: "Reservation management system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bg">
      <body>{children}</body>
    </html>
  );
}
