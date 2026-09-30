export type AdjustmentEntry = {
  id: string;
  label: string;
  tab: string;
  workspace?: string;
  group?: string;
  control?: string;
  details?: string;
  keywords?: string;
};

const inGroup = (
  tab: string,
  group: string,
  controls: (string | [string, string, string?, string?])[],
): AdjustmentEntry[] =>
  controls.map((item) => {
    const [label, control, keywords, details] =
      typeof item === "string" ? [item, item] : item;
    return {
      id: `${tab}/${group}/${label}`,
      label,
      tab,
      group,
      control,
      keywords,
      details,
    };
  });

export const adjustmentCatalog: AdjustmentEntry[] = [
  {
    id: "Adjust/Resolution",
    label: "Neural resolution",
    tab: "Adjust",
    control: "Resolution",
    details: "Neural settings",
    keywords: "processing preview quality",
  },
  ...["Contrast", "Gamma", "Vibrance", "Brightness", "Saturation", "Hue"].map(
    (label) => ({
      id: `Adjust/${label}`,
      label,
      tab: "Adjust",
      control: label,
    }),
  ),
  ...inGroup("Refine", "LUTs", [
    ["LUT preset", "LUT preset", "lookup table color look cube"],
    "LUT strength",
    [
      "LUT color space",
      "LUT color space",
      "transfer srgb rec709 linear",
      "Color space & range",
    ],
    [
      "LUT range handling",
      "LUT range handling",
      "clamp preserve hdr",
      "Color space & range",
    ],
  ]),
  ...inGroup("Refine", "Enhance", [
    ["DLSS Detail", "DLSS Detail", "neural intensity"],
    ["Luminance denoise", "Luminance denoise", "noise reduction smooth"],
    "Sharpen",
    ["Chroma denoise", "Chroma denoise", "color noise reduction", "Advanced"],
    ["Preserve detail", "Preserve detail", "noise reduction", "Advanced"],
    ["Sharpen radius", "Radius", "edge detail", "Advanced"],
    ["Sharpen threshold", "Threshold", "edge detail", "Advanced"],
    ["Micro detail", "Micro detail", "texture", "Advanced"],
  ]),
  ...inGroup("Refine", "Tone", [
    ["Auto Exposure", "Auto Exposure", "automatic brightness"],
    ["Exposure", "Exposure", "ev brightness light"],
    "Highlights",
    "Shadows",
    "Whites",
    "Blacks",
    ["Tone curve", "Tone curve", "curves rgb contrast", "Curves"],
  ]),
  ...inGroup("Refine", "Color", [
    ["Auto white balance", "Auto WB", "wb neutral temperature tint"],
    ["Pick neutral", "Pick neutral", "white balance eyedropper wb"],
    ["Temperature", "Temperature", "white balance warm cool wb"],
    ["Tint", "Tint", "white balance green magenta wb"],
    [
      "Color grading",
      "Grade strength",
      "wheels split toning shadows midtones highlights",
      "Color grading",
    ],
    ["Grade balance", "Balance", "color grading", "Color grading"],
    ["Lift", "Lift", "color grading shadows", "Color grading"],
    ["Gain", "Gain", "color grading highlights", "Color grading"],
  ]),
  ...inGroup("Refine", "Local", ["Clarity", "Texture", "Dehaze"]),
  ...inGroup("Effects", "Lens", [
    ["Bloom", "Bloom", "glow lens"],
    ["Bloom threshold", "Threshold", "glow lens"],
    ["Bloom radius", "Radius", "glow lens"],
    "Vignette",
    ["Vignette midpoint", "Midpoint", "lens"],
    ["Film grain", "Film grain", "noise film"],
  ]),
  ...inGroup("Effects", "Depth", [
    "Depth pass",
    "Depth near",
    "Depth far",
    ["Focus distance", "Focus distance", "depth of field dof"],
    ["Pick focus", "Pick focus", "depth of field eyedropper dof"],
    ["Depth blur", "Depth blur", "depth of field dof"],
    ["Depth fog", "Depth fog", "atmosphere"],
  ]),
  ...inGroup("Tools", "Crop / Transform", [
    ["Crop aspect", "Crop aspect", "ratio resize composition"],
    "Crop x",
    "Crop y",
    "Crop width",
    "Crop height",
    ["Rotate", "Rotate 90°", "rotation transform orientation"],
    ["Flip horizontal", "Flip H", "mirror transform"],
    ["Flip vertical", "Flip V", "mirror transform"],
  ]),
  ...inGroup("Tools", "Project", [
    ["Save project", "Save Project", "session"],
    ["Save project as", "Save As", "session copy"],
    ["Open project", "Open Project", "session load"],
  ]),
  ...inGroup("Export", "Output", [
    ["Output format", "Output format", "png jpg jpeg webp tiff exr export"],
    ["Output bit depth", "Output bit depth", "8 16 32 float precision export"],
    [
      "Output resolution",
      "Output size",
      "resize scale width height dimensions export",
    ],
    [
      "Output color space",
      "Output color space",
      "transfer srgb p3 rec709 acescg linear export",
    ],
  ]),
  {
    id: "Workspace/Masks",
    label: "Masks",
    tab: "Workspace",
    workspace: "Masks",
    control: "Add mask",
    keywords:
      "selection brush ellipse rectangle polygon radial linear luminance color local adjustments",
  },
  {
    id: "Workspace/Passes",
    label: "Render passes",
    tab: "Workspace",
    workspace: "Render Passes",
    control: "Display pass",
    keywords:
      "beauty albedo normal depth ao roughness metallic emission shadow diffuse specular object material id solo",
  },
  {
    id: "Workspace/Presets",
    label: "Preset library",
    tab: "Workspace",
    workspace: "Presets",
    control: "Search presets",
    keywords: "saved looks favorite import duplicate",
  },
  {
    id: "Workspace/Batch",
    label: "Batch processing",
    tab: "Workspace",
    workspace: "Batch",
    control: "Add renders",
    keywords: "queue multiple images sync settings",
  },
];

function normalized(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

export function findAdjustments(query: string): AdjustmentEntry[] {
  const term = normalized(query);
  if (!term) return [];
  const words = term.split(" ");
  return adjustmentCatalog
    .map((entry, order) => {
      const label = normalized(entry.label);
      const searchable = normalized(
        [
          entry.label,
          entry.tab,
          entry.workspace,
          entry.group,
          entry.keywords,
        ].join(" "),
      );
      const matches = words.every((word) => searchable.includes(word));
      const score =
        label === term
          ? 0
          : label.startsWith(term)
            ? 1
            : label.includes(term)
              ? 2
              : 3;
      return { entry, order, matches, score };
    })
    .filter((item) => item.matches)
    .sort((a, b) => a.score - b.score || a.order - b.order)
    .map((item) => item.entry);
}

export function adjustmentLocation(entry: AdjustmentEntry) {
  return [
    entry.tab,
    entry.workspace === "Render Passes" ? "Passes" : entry.workspace,
    entry.group,
  ]
    .filter(Boolean)
    .join(" / ");
}
