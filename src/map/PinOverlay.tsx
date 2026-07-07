// ピンは canvas に描かず DOM オーバーレイで表示する(DECISIONS §6。ヒットテスト不要化)。
// オーバーレイ自体は pointer-events: none にして下の canvas ジェスチャを妨げず、
// ピン要素だけがクリックを受ける。見た目のトークン適用(ステッカー風)は tokens.css 導入時。

import type { ReactElement } from "react";
import type { Camera } from "../domain/camera";
import { screenFromCellCenter } from "../domain/camera";
import type { Pin, PinId } from "../domain/types";

export type PinOverlayProps = {
	readonly pins: readonly Pin[];
	readonly camera: Camera;
	readonly onPinClick?: (id: PinId) => void;
};

export function PinOverlay({
	pins,
	camera,
	onPinClick,
}: PinOverlayProps): ReactElement {
	return (
		<div
			style={{
				position: "absolute",
				inset: 0,
				overflow: "hidden",
				pointerEvents: "none",
			}}
		>
			{pins.map((pin) => {
				const center = screenFromCellCenter(camera, pin.pos);
				return (
					<button
						key={pin.id}
						type="button"
						aria-label={pin.name}
						onClick={() => onPinClick?.(pin.id)}
						style={{
							position: "absolute",
							left: center.sx,
							top: center.sy,
							transform: "translate(-50%, -50%)",
							pointerEvents: "auto",
							background: "none",
							border: "none",
							padding: 0,
							cursor: "pointer",
							fontSize: 24,
							lineHeight: 1,
						}}
					>
						{pin.emoji}
					</button>
				);
			})}
		</div>
	);
}
