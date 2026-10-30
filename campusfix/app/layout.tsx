import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CampusFix · Shared hostel maintenance",
  description:
    "A shared maintenance team for your hostels. Report, understand, assign, repair and verify.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
