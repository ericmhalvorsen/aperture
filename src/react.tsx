"use client";

import { useEffect, useRef } from "react";
import type { BadgePosition, CustomToolDefinition } from "./client.js";
import { initAperture } from "./client.js";

interface ApertureProps {
	port?: number;
	serverUrl?: string;
	customTools?: Record<string, CustomToolDefinition>;
	badgePosition?: BadgePosition;
}

export function Aperture({
	port,
	serverUrl,
	customTools,
	badgePosition,
}: ApertureProps) {
	const customToolsRef = useRef(customTools);
	customToolsRef.current = customTools;

	useEffect(() => {
		const client = initAperture({
			port,
			serverUrl,
			customTools: customToolsRef.current,
			badgePosition,
		});

		return () => {
			if (client) {
				client.disconnect();
			}
		};
	}, [port, serverUrl, badgePosition]);

	return null;
}
