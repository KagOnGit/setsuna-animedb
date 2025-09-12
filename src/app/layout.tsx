export const metadata = {
  title: "Setsuna | Anime Assistant",
  description: "Conversational anime assistant with a VRM avatar",
};

import "./globals.css";
import React from "react";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main className="app-container">{children}</main>
      </body>
    </html>
  );
}

