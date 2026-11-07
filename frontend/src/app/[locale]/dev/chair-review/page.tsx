import { notFound } from "next/navigation";
import { ChairReviewCanvas } from "@/features/capabilities/components/chair-review-canvas";

/** Trang chụp render cho vòng review img2threejs — chỉ có ở môi trường dev. */
export default async function ChairReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const num = (key: string, fallback: number) => {
    const raw = params[key];
    const value = Number(Array.isArray(raw) ? raw[0] : raw);
    return Number.isFinite(value) ? value : fallback;
  };
  const mode = params.mode;
  const lightMode =
    mode === "neutral" || mode === "grazing" ? mode : "reference";

  return (
    <ChairReviewCanvas
      azimuthDeg={num("az", 135)}
      elevationDeg={num("el", 18)}
      explode={num("explode", 0)}
      lightMode={lightMode}
      stripMaps={params.maps === "0"}
    />
  );
}
