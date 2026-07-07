import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

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
