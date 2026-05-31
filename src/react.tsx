"use client";

import { useEffect } from "react";
import { initAperture } from "./client.js";

import type { CustomToolDefinition } from "./client.js";

interface ApertureProps {
	port?: number;
	serverUrl?: string;
	customTools?: Record<string, CustomToolDefinition>;
}

export function Aperture({ port, serverUrl, customTools }: ApertureProps) {
	useEffect(() => {
		const client = initAperture({ port, serverUrl, customTools });

		return () => {
			if (client) {
				client.disconnect();
			}
		};
	}, [port, serverUrl, customTools]);

	return null;
}
