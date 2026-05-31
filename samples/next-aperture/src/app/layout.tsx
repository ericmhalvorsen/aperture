import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Aperture } from "@halvo/aperture";
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
  title: "Aperture Next.js Example",
  description: "A barebones Next.js app with Aperture integrated",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Aperture 
          customTools={{
            get_dummy_data: {
              description: "Returns some dummy user data to prove custom tools work",
              inputSchema: { type: "object", properties: {} },
              handler: () => ({ users: [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }] })
            }
          }} 
        />
        {children}
      </body>
    </html>
  );
}
