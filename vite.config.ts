/// <reference types="vitest/config" />

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
	// GitHub Pages(akivvv/pokopoko-map)配信用のベースパス(DECISIONS §6)
	base: "/pokopoko-map/",
	plugins: [react()],
	test: {
		environment: "jsdom",
		setupFiles: ["./src/test/setup.ts"],
		globals: true,
	},
});
