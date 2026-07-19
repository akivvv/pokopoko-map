import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

// App は起動時に Firebase サインイン+RTDB 接続を張るため、テストでは sync を
// まるごとモックする(sync 自体のテストは mapSync.test.ts が fake アダプタで行う)
vi.mock("./sync", () => ({
	ensureSignedIn: () => Promise.resolve("test-uid"),
	getDb: () => ({}),
	createFirebaseRtdbAdapter: () => ({}),
	connectMapSync: () => ({
		sendPatch: () => {},
		disconnect: () => {},
		ready: Promise.resolve(),
	}),
}));

describe("App", () => {
	it("モード切替ボタンを表示し、初期は view モード", () => {
		render(<App />);
		expect(screen.getByRole("button", { name: "見る" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		expect(screen.getByRole("button", { name: "描く" })).toHaveAttribute(
			"aria-pressed",
			"false",
		);
	});

	it("描くモードに入るとパレットと消しゴムが現れる", () => {
		render(<App />);
		fireEvent.click(screen.getByRole("button", { name: "描く" }));
		expect(screen.getByRole("button", { name: "消す" })).toBeInTheDocument();
		expect(screen.getAllByRole("button", { name: /^色 #/ })).toHaveLength(4);
	});

	it("view モードではパレットを表示しない", () => {
		render(<App />);
		expect(
			screen.queryByRole("button", { name: "消す" }),
		).not.toBeInTheDocument();
	});
});
