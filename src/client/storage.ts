export const storage = {
	get(key: string): string | null {
		if (typeof window === "undefined" || typeof localStorage === "undefined") {
			return null;
		}
		try {
			return localStorage.getItem(key);
		} catch {
			return null;
		}
	},
	set(key: string, value: string): void {
		if (typeof window === "undefined" || typeof localStorage === "undefined") {
			return;
		}
		try {
			localStorage.setItem(key, value);
		} catch {}
	},
	remove(key: string): void {
		if (typeof window === "undefined" || typeof localStorage === "undefined") {
			return;
		}
		try {
			localStorage.removeItem(key);
		} catch {}
	},
};
