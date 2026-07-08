"use client";

import { useEffect, useRef } from "react";
import type { CustomToolDefinition } from "./client.js";
import { initAperture } from "./client.js";

interface ApertureProps {
	port?: number;
	serverUrl?: string;
	customTools?: Record<string, CustomToolDefinition>;
}

export function Aperture({ port, serverUrl, customTools }: ApertureProps) {
	const customToolsRef = useRef(customTools);
	customToolsRef.current = customTools;

	useEffect(() => {
		const client = initAperture({
			port,
			serverUrl,
			customTools: customToolsRef.current,
		});

		return () => {
			if (client) {
				client.disconnect();
			}
		};
	}, [port, serverUrl]);

	return null;
}
