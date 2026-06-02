import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ApertureWrapper } from "./ApertureWrapper";
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
				<ApertureWrapper />
				{children}
			</body>
		</html>
	);
}
