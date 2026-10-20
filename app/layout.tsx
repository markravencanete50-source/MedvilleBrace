import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Medville Brace | Supports & Braces", template: "%s | Medville Brace" },
  description: "Braces and supports for knee, back, ankle, wrist, shoulder, elbow and neck.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
