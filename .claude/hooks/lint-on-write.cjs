const path = require("node:path");
const { execFileSync } = require("node:child_process");

const PROJECT_DIR = path.resolve(__dirname, "..", "..");
const LINTABLE = /\.(ts|tsx|js|jsx|json|css)$/;

let raw = "";
process.stdin.on("data", (chunk) => {
	raw += chunk;
});
process.stdin.on("end", () => {
	let filePath = "";
	try {
		const input = JSON.parse(raw);
		filePath = (input.tool_input && input.tool_input.file_path) || "";
	} catch {
		return;
	}

	if (!filePath.startsWith(PROJECT_DIR) || !LINTABLE.test(filePath)) return;

	try {
		execFileSync(
			"npx",
			["--no-install", "biome", "check", "--write", filePath],
			{
				cwd: PROJECT_DIR,
				stdio: "ignore",
				shell: true,
			},
		);
	} catch {
		// フォーマット不能なエラーが残っても自動修正の妨げにはしない(黙って終了)
	}
});
