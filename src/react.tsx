"use client";

import { useEffect } from "react";
import { initAperture } from "./client.js";

interface ApertureProps {
	port?: number;
	serverUrl?: string;
}

export function Aperture({ port, serverUrl }: ApertureProps) {
	useEffect(() => {
		const client = initAperture({ port, serverUrl });

		return () => {
			if (client) {
				client.disconnect();
			}
		};
	}, [port, serverUrl]);

	return null;
}
