"use client";
import { Aperture } from "@ericmhalvorsen/aperture/react";

export function ApertureWrapper() {
	return (
		<Aperture
			customTools={{
				get_dummy_data: {
					description:
						"Returns some dummy user data to prove custom tools work",
					inputSchema: { type: "object", properties: {} },
					handler: () => ({
						users: [
							{ id: 1, name: "Alice" },
							{ id: 2, name: "Bob" },
						],
					}),
				},
			}}
		/>
	);
}
