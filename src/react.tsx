import { useEffect, useRef } from "react";
import { ApertureClient } from "./client.js";

interface ApertureProps {
	serverUrl?: string;
}

export function Aperture({ serverUrl = "ws://localhost:3456" }: ApertureProps) {
	const clientRef = useRef<ApertureClient | null>(null);

	useEffect(() => {
		if (typeof window === "undefined") return;

		// Only run in browser dev mode (localhost/127.0.0.1)
		const isDev =
			location.hostname === "localhost" || location.hostname === "127.0.0.1";
		if (!isDev) return;

		const client = new ApertureClient({ serverUrl });
		clientRef.current = client;
		client.connect();

		return () => {
			client.disconnect();
		};
	}, [serverUrl]);

	return null;
}
