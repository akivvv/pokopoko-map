import "@testing-library/jest-dom/vitest";

// jsdom に無いブラウザ API のスタブ(MapView が使用)。
// レイアウト・メディア照会の挙動は検証対象にしない前提で no-op にする。
if (typeof globalThis.ResizeObserver === "undefined") {
	globalThis.ResizeObserver = class {
		observe(): void {}
		unobserve(): void {}
		disconnect(): void {}
	} as unknown as typeof ResizeObserver;
}

if (typeof window !== "undefined" && !window.matchMedia) {
	window.matchMedia = ((query: string) =>
		({
			matches: false,
			media: query,
			onchange: null,
			addEventListener: () => {},
			removeEventListener: () => {},
			addListener: () => {},
			removeListener: () => {},
			dispatchEvent: () => false,
		}) as unknown as MediaQueryList) as typeof window.matchMedia;
}
