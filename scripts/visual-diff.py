"""Local screenshot comparison. Never registers, rescales, or alters either input.

Usage: python scripts/visual-diff.py --iteration 00 [--exclusions path.json]
Dependencies: Pillow, numpy. SSIM is implemented locally with an 11px Gaussian
window (sigma 1.5), luminance weights BT.709, and a 255 intensity data range.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


REGIONS = {
    "native_titlebar": [0, 0, 1280, 43],
    "navigation_rail": [0, 43, 51, 819],
    "sidebar": [51, 43, 291, 819],
    "main_workspace": [291, 43, 1276, 815],
    "hero_glyph": [750, 300, 818, 366],
    "hero_title": [522, 380, 1033, 426],
    "composer_context_shelf": [429, 663, 1139, 701],
    "composer_input": [415, 700, 1153, 800],
}


def gaussian_blur(array: np.ndarray) -> np.ndarray:
    positions = np.arange(-5, 6, dtype=np.float64)
    weights = np.exp(-(positions * positions) / (2 * 1.5 ** 2))
    weights /= weights.sum()
    height, width = array.shape
    pad_x = np.pad(array, ((0, 0), (5, 5)), mode="reflect")
    horizontal = sum(weight * pad_x[:, offset:offset + width] for offset, weight in enumerate(weights))
    pad_y = np.pad(horizontal, ((5, 5), (0, 0)), mode="reflect")
    return sum(weight * pad_y[offset:offset + height, :] for offset, weight in enumerate(weights))


def ssim_map(reference: np.ndarray, actual: np.ndarray) -> np.ndarray:
    weights = np.array([0.2126, 0.7152, 0.0722])
    x, y = reference @ weights, actual @ weights
    mu_x, mu_y = gaussian_blur(x), gaussian_blur(y)
    var_x = np.maximum(gaussian_blur(x * x) - mu_x * mu_x, 0)
    var_y = np.maximum(gaussian_blur(y * y) - mu_y * mu_y, 0)
    covariance = gaussian_blur(x * y) - mu_x * mu_y
    c1, c2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    return ((2 * mu_x * mu_y + c1) * (2 * covariance + c2)) / ((mu_x * mu_x + mu_y * mu_y + c1) * (var_x + var_y + c2))


def metric(reference: np.ndarray, actual: np.ndarray, local_ssim: np.ndarray, mask: np.ndarray) -> dict:
    samples = int(mask.sum())
    if not samples:
        return {"included_pixels": 0}
    absolute = np.abs(reference - actual)
    selected = absolute[mask]
    valid_ssim = mask.copy()
    valid_ssim[:5, :] = False
    valid_ssim[-5:, :] = False
    valid_ssim[:, :5] = False
    valid_ssim[:, -5:] = False
    return {
        "included_pixels": samples,
        "mae_rgb_0_to_255": round(float(selected.mean()), 6),
        "rmse_rgb_0_to_255": round(float(np.sqrt(np.mean(selected ** 2))), 6),
        "ssim_luminance": round(float(local_ssim[valid_ssim].mean()), 6) if valid_ssim.any() else None,
        "fraction_pixels_max_channel_delta_gt_16": round(float((absolute.max(axis=2)[mask] > 16).mean()), 6),
        "fraction_pixels_exact_rgb_match": round(float((absolute.max(axis=2)[mask] == 0).mean()), 6),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--iteration", default="00")
    parser.add_argument("--reference", default="artifacts/visual/reference-original.png")
    parser.add_argument("--actual")
    parser.add_argument("--output")
    parser.add_argument("--crop", default="94,34,1374,853", help="Reference pixel bounds x1,y1,x2,y2, exclusive right/bottom")
    parser.add_argument("--exclusions", help="JSON list of {name,reason,box:[x1,y1,x2,y2]}, or a measurements.json with optional_user_specific_text_masks")
    parser.add_argument("--regions", help="Optional JSON object mapping region names to [x1,y1,x2,y2] in comparison-image coordinates")
    parser.add_argument("--capture", help="Optional visual-capture.json to disclose popup crop translation and content scope")
    args = parser.parse_args()
    output = Path(args.output or f"artifacts/visual/iteration-{args.iteration}")
    output.mkdir(parents=True, exist_ok=True)
    reference_path, actual_path = Path(args.reference), Path(args.actual or output / "actual.png")
    crop = tuple(int(value) for value in args.crop.split(","))
    original = Image.open(reference_path).convert("RGB")
    if len(crop) != 4 or not (0 <= crop[0] < crop[2] <= original.width and 0 <= crop[1] < crop[3] <= original.height):
        raise ValueError(f"Reference crop must lie entirely within the original image; got {crop} in {original.size}.")
    reference = original.crop(crop)
    actual = Image.open(actual_path).convert("RGB")
    if reference.size != actual.size:
        (output / "dimension-mismatch.json").write_text(json.dumps({"reference_size": reference.size, "actual_size": actual.size, "note": "No metrics computed: inputs must have equal pixel dimensions. No scaling or padding was applied."}, indent=2), encoding="utf-8")
        raise ValueError(f"Image dimensions must match exactly; reference={reference.size}, actual={actual.size}. No automatic resizing is allowed.")
    reference.save(output / "reference-crop.png")
    Image.blend(reference, actual, 0.5).save(output / "overlay-50.png")
    pair = Image.new("RGB", (reference.width * 2, reference.height))
    pair.paste(reference, (0, 0)); pair.paste(actual, (reference.width, 0)); pair.save(output / "side-by-side.png")
    ref_array, act_array = np.asarray(reference, dtype=np.float64), np.asarray(actual, dtype=np.float64)
    difference = np.abs(ref_array - act_array)
    Image.fromarray(difference.astype(np.uint8)).save(output / "difference-raw.png")
    Image.fromarray(np.clip(difference * 4, 0, 255).astype(np.uint8)).save(output / "difference-amplified-4x.png")
    intensity = difference.max(axis=2)
    heatmap = np.zeros_like(ref_array)
    heatmap[:, :, 0] = np.clip(intensity * 5, 0, 255)
    heatmap[:, :, 1] = np.clip((intensity - 40) * 3, 0, 255)
    heatmap[:, :, 2] = np.clip((intensity - 110) * 2, 0, 255)
    Image.fromarray(heatmap.astype(np.uint8)).save(output / "heatmap-unmasked.png")
    local_ssim = ssim_map(ref_array, act_array)
    full = np.ones(ref_array.shape[:2], dtype=bool)
    exclusions = json.loads(Path(args.exclusions).read_text(encoding="utf-8")) if args.exclusions else []
    if isinstance(exclusions, dict):
        exclusions = [{"name": item["name"], "reason": item["comment"], "box": item["window_box"]} for item in exclusions["optional_user_specific_text_masks"]]
    structural = full.copy()
    marked = reference.copy()
    draw = ImageDraw.Draw(marked)
    for exclusion in exclusions:
        x1, y1, x2, y2 = exclusion["box"]
        if not (0 <= x1 < x2 <= reference.width and 0 <= y1 < y2 <= reference.height):
            raise ValueError(f"Exclusion outside image: {exclusion}")
        structural[y1:y2, x1:x2] = False
        draw.rectangle([x1, y1, x2 - 1, y2 - 1], outline="#ff3366", width=1)
    marked.save(output / "reference-exclusion-boxes.png")
    Image.fromarray((structural * 255).astype(np.uint8)).save(output / "included-pixel-mask.png")
    region_definitions = json.loads(Path(args.regions).read_text(encoding="utf-8")) if args.regions else REGIONS if reference.size == (1280, 819) else {"entire_declared_crop": [0, 0, reference.width, reference.height]}
    regions = {}
    for name, (x1, y1, x2, y2) in region_definitions.items():
        if not (0 <= x1 < x2 <= reference.width and 0 <= y1 < y2 <= reference.height):
            raise ValueError(f"Region outside comparison image: {name}, {(x1, y1, x2, y2)}")
        region_mask = np.zeros_like(full)
        region_mask[y1:y2, x1:x2] = True
        regions[name] = {"box": [x1, y1, x2, y2], "raw": metric(ref_array, act_array, local_ssim, region_mask), "excluding_declared_user_text": metric(ref_array, act_array, local_ssim, region_mask & structural)}
    report = {
        "iteration": args.iteration,
        "reference_source": str(reference_path.resolve()),
        "reference_sha256": hashlib.sha256(reference_path.read_bytes()).hexdigest(),
        "actual_source": str(actual_path.resolve()),
        "actual_sha256": hashlib.sha256(actual_path.read_bytes()).hexdigest(),
        "reference_original_size": original.size,
        "reference_crop_xyxy": crop,
        "comparison_size": reference.size,
        "alignment": "None. No scaling, registration, blur, color correction, or pixel replacement.",
        "ssim_method": "Luminance BT.709; 11x11 Gaussian sigma=1.5; K1=.01 K2=.03; population covariance; 5px outer border omitted from SSIM averaging.",
        "raw_unmasked": metric(ref_array, act_array, local_ssim, full),
        "declared_exclusions": exclusions,
        "excluded_pixels": int((~structural).sum()),
        "excluding_declared_user_text": metric(ref_array, act_array, local_ssim, structural),
        "regions": regions,
        "interpretation": "These metrics measure pixel differences, not a percentage of visual fidelity. Large blank areas can inflate SSIM. Inspect the unmasked overlay, heatmap, and individual regions; excluded text never changes the full raw metrics or images.",
        "heatmap": "max RGB absolute delta: red=clip(delta*5), green=clip((delta-40)*3), blue=clip((delta-110)*2). Black means exact match. Raw difference is also included.",
    }
    if args.capture:
        capture = json.loads(Path(args.capture).read_text(encoding="utf-8"))
        report["content_scope"] = capture.get("referenceScope")
        if capture.get("popup") and actual_path.name in ("actual-popup.png", "actual-popup-grid.png"):
            popup = capture["popup"]
            box = popup["gridCrop"] if actual_path.name == "actual-popup-grid.png" else popup["box"]
            report["actual_popup_css_box_xywh"] = popup["box"]
            report["actual_popup_pixel_crop_xywh"] = box
            if actual_path.name == "actual-popup-grid.png":
                report["actual_popup_pixel_crop_note"] = popup["gridCropNote"]
            report["crop_translation_actual_minus_reference"] = [box["x"] - crop[0], box["y"] - crop[1]]
            report["alignment"] = "Explicit independent popup crops, top-left origins compared; translation is disclosed separately. No scaling, image registration, blur, color correction, or pixel replacement. Full frames are retained. See content_scope for comparison limitations."
    (output / "metrics.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = [f"# Screenshot comparison: iteration {args.iteration}", "", f"Reference crop: {crop}; dimensions: {reference.size}; no registration or scaling.", "", report["alignment"], "", "| Region | MAE / 255 | RMSE / 255 | SSIM | Pixels with delta > 16 |", "|---|---:|---:|---:|---:|"]
    for name, values in [("Full, unmasked", report["raw_unmasked"])] + [(name, values["raw"]) for name, values in regions.items()]:
        lines.append(f"| {name} | {values['mae_rgb_0_to_255']:.3f} | {values['rmse_rgb_0_to_255']:.3f} | {values['ssim_luminance']:.4f} | {values['fraction_pixels_max_channel_delta_gt_16']:.1%} |")
    lines += ["", report["interpretation"], "", f"Declared text exclusions: {len(exclusions)}, {report['excluded_pixels']} pixels ({report['excluded_pixels'] / full.size:.2%}). Full unmasked metrics above are never affected."]
    if report.get("content_scope"):
        lines += ["", report["content_scope"]]
    if report.get("crop_translation_actual_minus_reference"):
        lines += ["", f"Popup top-left translation (actual minus native reference): {report['crop_translation_actual_minus_reference']} physical pixels."]
    if exclusions:
        lines += ["", "Supplemental comparison excluding only the declared user-specific text rectangles:", "", "| Region | MAE / 255 | RMSE / 255 | SSIM |", "|---|---:|---:|---:|"]
        for name, values in [("Full except declared text", report["excluding_declared_user_text"])] + [(name, values["excluding_declared_user_text"]) for name, values in regions.items()]:
            lines.append(f"| {name} | {values['mae_rgb_0_to_255']:.3f} | {values['rmse_rgb_0_to_255']:.3f} | {values['ssim_luminance']:.4f} |")
    (output / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output.resolve()), "raw_unmasked": report["raw_unmasked"], "excluded_pixels": report["excluded_pixels"]}))


if __name__ == "__main__":
    main()
