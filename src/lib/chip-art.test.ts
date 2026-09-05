import { describe, expect, it } from "vitest";
import {
  CHIP_PRESETS,
  deriveEdgeColor,
  faceColor,
  inlayFontSize,
  inlayInk,
  isLight,
  luminance,
  mix,
  parseHex,
  spotDashArray,
  SPOT_CIRCUMFERENCE,
  MAX_SPOTS,
  MIN_SPOTS,
} from "./chip-art";

describe("parseHex", () => {
  it("accepts #rrggbb with or without the hash", () => {
    expect(parseHex("#FF8000")).toEqual({ r: 255, g: 128, b: 0 });
    expect(parseHex("ff8000")).toEqual({ r: 255, g: 128, b: 0 });
  });

  it("rejects anything the database cannot hold", () => {
    for (const bad of ["#fff", "red", "rgb(0,0,0)", "#12345g", ""]) {
      expect(parseHex(bad)).toBeNull();
    }
  });
});

describe("luminance", () => {
  it("spans black to white", () => {
    expect(luminance("#000000")).toBeCloseTo(0, 5);
    expect(luminance("#FFFFFF")).toBeCloseTo(1, 5);
  });

  it("treats unparseable colour as dark, the safer default", () => {
    expect(luminance("not a colour")).toBe(0);
  });
});

describe("spot colour derivation", () => {
  it("puts cream spots on a dark body and dark spots on a pale one", () => {
    expect(deriveEdgeColor("#14110F")).toBe("#F5EDE6");
    expect(deriveEdgeColor("#F4F1E8")).toBe("#3B2F2C");
  });

  it("never leaves a chip as a blank disc, which one derived colour did", () => {
    // A white chip deriving its spots from itself rendered white-on-white.
    const white = "#FFFFFF";
    expect(deriveEdgeColor(white)).not.toBe(white);
    expect(isLight(white)).toBe(true);
  });
});

describe("inlay ink", () => {
  it("is dark on a pale chip and cream on a dark one", () => {
    expect(inlayInk("#F4F1E8")).toBe("#1A1512");
    expect(inlayInk("#14110F")).toBe("#F5EDE6");
  });

  it("stays readable on every shipped preset", () => {
    for (const preset of CHIP_PRESETS) {
      const face = faceColor(preset.body);
      const ink = inlayInk(preset.body);
      const contrast =
        (Math.max(luminance(face), luminance(ink)) + 0.05) /
        (Math.min(luminance(face), luminance(ink)) + 0.05);
      // Large bold text; 4.5 clears WCAG AA for normal text with room to spare.
      expect(contrast, `${preset.name} (${preset.body})`).toBeGreaterThan(4.5);
    }
  });
});

describe("mix", () => {
  it("returns the endpoints unchanged", () => {
    expect(mix("#000000", "#FFFFFF", 0)).toBe("#000000");
    expect(mix("#000000", "#FFFFFF", 1)).toBe("#ffffff");
  });

  it("passes an unparseable colour straight through", () => {
    expect(mix("nope", "#FFFFFF", 0.5)).toBe("nope");
  });
});

describe("spotDashArray", () => {
  it("splits the rim so N spots each fill half their pitch", () => {
    for (let count = MIN_SPOTS; count <= MAX_SPOTS; count += 1) {
      const [dash, gap] = spotDashArray(count).split(" ").map(Number);
      expect(dash).toBeCloseTo(gap, 5);
      // One dash plus one gap per spot must close the circle exactly.
      expect((dash + gap) * count).toBeCloseTo(SPOT_CIRCUMFERENCE, 1);
    }
  });

  it("keeps the double mould on the same pitch as the single", () => {
    const single = spotDashArray(6, "single").split(" ").map(Number);
    const double = spotDashArray(6, "double").split(" ").map(Number);
    const pitch = single[0] + single[1];
    expect(double.reduce((sum, part) => sum + part, 0)).toBeCloseTo(pitch, 2);
  });

  it("clamps a count outside the supported range", () => {
    expect(spotDashArray(0)).toBe(spotDashArray(MIN_SPOTS));
    expect(spotDashArray(99)).toBe(spotDashArray(MAX_SPOTS));
  });
});

describe("inlayFontSize", () => {
  it("steps down as the denomination gets longer", () => {
    const sizes = ["5", "25", "100", "1000"].map(inlayFontSize);
    expect(sizes[0]).toBe(sizes[1]);
    for (let i = 1; i < sizes.length; i += 1) {
      expect(sizes[i]).toBeLessThanOrEqual(sizes[i - 1]);
    }
  });
});

describe("CHIP_PRESETS", () => {
  it("stores every colour in the form the database accepts", () => {
    for (const preset of CHIP_PRESETS) {
      expect(preset.body).toMatch(/^#[0-9A-F]{6}$/);
      expect(preset.edge).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it("never pairs a body with a spot that is merely a shade of it", () => {
    for (const preset of CHIP_PRESETS) {
      const separation = Math.abs(
        luminance(preset.body) - luminance(preset.edge),
      );
      expect(separation, preset.name).toBeGreaterThan(0.15);
    }
  });
});
