/*
 * Dữ liệu cấu trúc trang Năng lực (theo mockup "BINH BFC Capabilities" trên Claude Design).
 * Text nằm trong messages; ở đây chỉ giữ cấu trúc, toạ độ và tham chiếu ảnh placeholder.
 */

export type ChairPartDef = {
  /** Khoá text trong messages (CapabilitiesPage.madeHere.callouts) */
  key: string;
  /** Anchor xưởng đích (#ws-N) */
  ws: number;
  /** Component trong model 3D (3d/swivel-chair/object-sculpt-spec.json) mà nhãn bám theo */
  anchor: string;
};

/** Bộ phận của ghế xoay 3D — thứ tự trên xuống dưới */
export const chairParts: ChairPartDef[] = [
  { key: "cushion", ws: 5, anchor: "cushion-back" },
  { key: "teakFrame", ws: 1, anchor: "rear-top-rail" },
  { key: "rope", ws: 4, anchor: "weave-rear" },
  { key: "swivelBase", ws: 1, anchor: "base-ring" },
];

export type WorkshopDef = {
  key: string;
  /** true → xưởng thuần thủ công, hiện nhãn "Không dùng máy" */
  hand?: boolean;
  /** true → có dòng "Nhận từ" (text trong messages) */
  hasReceives?: boolean;
  imgs: string[];
};

export const workshopDefs: WorkshopDef[] = [
  {
    key: "woodworking",
    hasReceives: true,
    imgs: [
      "Slideshow_Teak_8.JPG\n5-axis CNC · 4:3",
      "Slideshow_Teak_7.JPG\nrip saw · 4:3",
    ],
  },
  {
    key: "aluminum",
    hasReceives: true,
    imgs: [
      "Slideshow_Alu_7.jpg\nwelding robot · 4:3",
      "Slideshow_Alu_5.jpg\nlaser cutting · 4:3",
      "Slideshow_Alu_6.jpg\nbending · 4:3",
    ],
  },
  {
    key: "powderCoating",
    hasReceives: true,
    imgs: [
      "Slideshow_Alu_3.JPG\npowder coating\n⚠ only photo, shoot the pre-treatment line · 4:3",
    ],
  },
  {
    key: "weaving",
    hand: true,
    hasReceives: true,
    imgs: [
      "Slideshow_Wicker_2.png\nwicker weaver · 4:3",
      "Slideshow_Rope_2.jpg\nrope weaver · 4:3",
    ],
  },
  {
    key: "upholstery",
    hasReceives: true,
    // Ảnh xưởng may nệm chưa có — tạm dùng ảnh nhà máy tổng hợp
    imgs: [
      "Slideshow_1_10.jpg\nstand-in - fabric cutting pending · 4:3",
      "Slideshow_1_4_2.jpg\nstand-in - sewing line pending · 4:3",
    ],
  },
  {
    key: "packing",
    hasReceives: true,
    imgs: [
      "Slideshow_1_2.png\ncontainer yard · 4:3",
      "Slideshow_1_7.jpg\nfactory yard · 4:3",
    ],
  },
];

export const stageKeys = ["1", "2", "3", "4", "5", "6"] as const;

export const boughtInItems: { key: string; unconfirmed: boolean }[] = [
  { key: "fabric", unconfirmed: false },
  { key: "profile", unconfirmed: false },
  { key: "timber", unconfirmed: false },
  { key: "foam", unconfirmed: true },
  { key: "stone", unconfirmed: true },
  { key: "fittings", unconfirmed: true },
];

export const processStepDefs: {
  key: string;
  hasNeeds: boolean;
  hasTime: boolean;
}[] = [
  { key: "step1", hasNeeds: true, hasTime: false },
  { key: "step2", hasNeeds: false, hasTime: true },
  { key: "step3", hasNeeds: true, hasTime: true },
  { key: "step4", hasNeeds: true, hasTime: false },
  { key: "step5", hasNeeds: true, hasTime: true },
  { key: "step6", hasNeeds: true, hasTime: false },
];
