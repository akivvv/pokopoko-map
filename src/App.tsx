import { useState } from "react";
import "./App.css";

function App() {
	const [count, setCount] = useState(0);

	return (
		<>
			<h1>pokomap-next</h1>
			<p>
				リビルド用の土台(Vite + React + TypeScript)。まだ中身はプレースホルダー
			</p>
			<button type="button" onClick={() => setCount((count) => count + 1)}>
				Count is {count}
			</button>
		</>
	);
}

export default App;
