"use client";

import { useEffect, useRef } from "react";
import { createChairScene } from "../three/chair-scene";

type ChairReviewCanvasProps = {
  azimuthDeg: number;
  elevationDeg: number;
  explode: number;
  lightMode: "neutral" | "grazing" | "reference";
  stripMaps: boolean;
};

/**
 * Canvas render đánh giá cho pipeline img2threejs: camera cố định, renderer thuần (không composer),
 * nền trắng như ảnh studio. Gắn data-ready khi khung hình đầu đã vẽ để công cụ chụp chờ đúng lúc.
 */
export function ChairReviewCanvas({
  azimuthDeg,
  elevationDeg,
  explode,
  lightMode,
  stripMaps,
}: ChairReviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // lề 1.45: phần gần camera của ghế (sâu ±0.4 m) phóng to theo phối cảnh, lề 1.12 cắt mất đế
    const chair = createChairScene(canvas, {
      azimuthDeg,
      elevationDeg,
      lightMode,
      stripMaps,
      loop: false,
      margin: 1.45,
    });
    chair.setExplode(explode);
    chair.render();
    // vài khung để bóng VSM và texture tải xong
    let frames = 0;
    const settle = () => {
      chair.render();
      if (++frames < 30) requestAnimationFrame(settle);
      else canvas.dataset.ready = "true";
    };
    requestAnimationFrame(settle);
    return () => chair.dispose();
  }, [azimuthDeg, elevationDeg, explode, lightMode, stripMaps]);

  return <canvas ref={canvasRef} className="block h-screen w-screen" />;
}
