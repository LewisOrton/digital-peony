#!/usr/bin/env python3
"""Extract and tessellate the 牡/丹 silhouettes into a runtime-free TS asset.

Build-only dependencies:
  python3 -m pip install fonttools mapbox-earcut numpy

The input font is intentionally not copied into the application. The checked-in
output contains only filled mask vertices and indices for the two glyphs.
"""

from __future__ import annotations

import argparse
import hashlib
import math
from pathlib import Path

import mapbox_earcut
import numpy
from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont


GLYPHS = ("牡", "丹")


def point_line_distance(point, start, end):
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    length = math.hypot(dx, dy)
    if length == 0:
        return math.hypot(point[0] - start[0], point[1] - start[1])
    return abs(
        dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0]
    ) / length


def flatten_quadratic(start, control, end, tolerance, output):
    if point_line_distance(control, start, end) <= tolerance:
        output.append(end)
        return
    start_control = midpoint(start, control)
    control_end = midpoint(control, end)
    middle = midpoint(start_control, control_end)
    flatten_quadratic(start, start_control, middle, tolerance, output)
    flatten_quadratic(middle, control_end, end, tolerance, output)


def flatten_cubic(start, control_a, control_b, end, tolerance, output):
    flatness = max(
        point_line_distance(control_a, start, end),
        point_line_distance(control_b, start, end),
    )
    if flatness <= tolerance:
        output.append(end)
        return
    start_a = midpoint(start, control_a)
    a_b = midpoint(control_a, control_b)
    b_end = midpoint(control_b, end)
    left_b = midpoint(start_a, a_b)
    right_a = midpoint(a_b, b_end)
    middle = midpoint(left_b, right_a)
    flatten_cubic(start, start_a, left_b, middle, tolerance, output)
    flatten_cubic(middle, right_a, b_end, end, tolerance, output)


def midpoint(a, b):
    return ((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5)


class FlattenPen(BasePen):
    def __init__(self, glyph_set, tolerance):
        super().__init__(glyph_set)
        self.tolerance = tolerance
        self.contours = []
        self.current = []

    def _moveTo(self, point):
        self.current = [point]

    def _lineTo(self, point):
        self.current.append(point)

    def _curveToOne(self, control_a, control_b, point):
        flatten_cubic(
            self.current[-1],
            control_a,
            control_b,
            point,
            self.tolerance,
            self.current,
        )

    def _qCurveToOne(self, control, point):
        flatten_quadratic(
            self.current[-1],
            control,
            point,
            self.tolerance,
            self.current,
        )

    def _closePath(self):
        self._finish_contour()

    def _endPath(self):
        self._finish_contour()

    def _finish_contour(self):
        contour = simplify_contour(self.current)
        if len(contour) >= 3:
            self.contours.append(contour)
        self.current = []


def simplify_contour(points):
    if not points:
        return []
    output = []
    for point in points:
        if not output or squared_distance(output[-1], point) > 1e-10:
            output.append((float(point[0]), float(point[1])))
    if len(output) > 1 and squared_distance(output[0], output[-1]) <= 1e-10:
        output.pop()
    return output


def squared_distance(a, b):
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2


def signed_area(contour):
    return sum(
        contour[index][0] * contour[(index + 1) % len(contour)][1]
        - contour[(index + 1) % len(contour)][0] * contour[index][1]
        for index in range(len(contour))
    ) * 0.5


def point_in_polygon(point, contour):
    inside = False
    previous = contour[-1]
    for current in contour:
        if (current[1] > point[1]) != (previous[1] > point[1]):
            crossing_x = (
                (previous[0] - current[0])
                * (point[1] - current[1])
                / (previous[1] - current[1])
                + current[0]
            )
            if point[0] < crossing_x:
                inside = not inside
        previous = current
    return inside


def contour_parents(contours):
    areas = [abs(signed_area(contour)) for contour in contours]
    parents = []
    for index, contour in enumerate(contours):
        point = contour[0]
        candidates = [
            candidate
            for candidate in range(len(contours))
            if candidate != index
            and areas[candidate] > areas[index]
            and point_in_polygon(point, contours[candidate])
        ]
        parents.append(min(candidates, key=areas.__getitem__) if candidates else None)
    return parents


def contour_depth(index, parents):
    depth = 0
    parent = parents[index]
    while parent is not None:
        depth += 1
        parent = parents[parent]
    return depth


def tessellate(contours):
    parents = contour_parents(contours)
    depths = [contour_depth(index, parents) for index in range(len(contours))]
    vertices = []
    indices = []
    for outer_index, outer in enumerate(contours):
        if depths[outer_index] % 2 != 0:
            continue
        rings = [outer]
        rings.extend(
            contours[index]
            for index, parent in enumerate(parents)
            if parent == outer_index and depths[index] % 2 == 1
        )
        polygon_vertices = [point for ring in rings for point in ring]
        ring_ends = numpy.cumsum([len(ring) for ring in rings], dtype=numpy.uint32)
        triangle_indices = mapbox_earcut.triangulate_float64(
            numpy.asarray(polygon_vertices, dtype=numpy.float64),
            ring_ends,
        )
        base = len(vertices)
        vertices.extend(polygon_vertices)
        indices.extend(base + int(index) for index in triangle_indices)
    return vertices, indices


def format_numbers(values, per_line=12):
    lines = []
    for start in range(0, len(values), per_line):
        chunk = values[start : start + per_line]
        lines.append("  " + ", ".join(chunk) + ",")
    return "\n".join(lines)


def generate(font_path, output_path, tolerance):
    font = TTFont(font_path)
    glyph_set = font.getGlyphSet()
    cmap = font.getBestCmap()
    units_per_em = font["head"].unitsPerEm
    glyph_records = []
    bounds = []
    for glyph in GLYPHS:
        glyph_name = cmap[ord(glyph)]
        pen = FlattenPen(glyph_set, tolerance)
        glyph_set[glyph_name].draw(pen)
        vertices, indices = tessellate(pen.contours)
        advance_width, _ = font["hmtx"][glyph_name]
        bounds.extend(vertices)
        glyph_records.append((glyph, advance_width, vertices, indices))

    minimum_y = min(point[1] for point in bounds)
    maximum_y = max(point[1] for point in bounds)
    vertical_center = (minimum_y + maximum_y) * 0.5
    positions = []
    glyph_kinds = []
    indices = []
    for kind, (_, advance_width, vertices, glyph_indices) in enumerate(glyph_records):
        base = len(positions) // 3
        for x, y in vertices:
            positions.extend(
                (
                    (x - advance_width * 0.5) / units_per_em,
                    (y - vertical_center) / units_per_em,
                    0,
                )
            )
            glyph_kinds.append(kind)
        indices.extend(base + index for index in glyph_indices)

    if len(positions) // 3 > 65535:
        raise RuntimeError("Glyph geometry no longer fits Uint16 indices")

    font_sha256 = hashlib.sha256(Path(font_path).read_bytes()).hexdigest()
    position_values = [f"{value:.6f}".rstrip("0").rstrip(".") for value in positions]
    kind_values = [str(value) for value in glyph_kinds]
    index_values = [str(value) for value in indices]
    source = f"""// Generated by scripts/generate-stage-three-glyph-geometry.py.
// Source: Noto Sans CJK SC Black, SIL Open Font License 1.1.
// Source SHA-256: {font_sha256}
// Runtime payload: vector vertices/indices only; no font or raster atlas.

export const STAGE_THREE_GLYPH_POSITIONS = new Float32Array([
{format_numbers(position_values)}
]);

export const STAGE_THREE_GLYPH_KINDS = new Uint8Array([
{format_numbers(kind_values, 24)}
]);

export const STAGE_THREE_GLYPH_INDICES = new Uint16Array([
{format_numbers(index_values, 18)}
]);
"""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(source, encoding="utf-8")
    print(
        f"generated {output_path}: {len(positions) // 3} vertices, "
        f"{len(indices) // 3} triangles"
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--font", required=True, type=Path)
    parser.add_argument(
        "--output",
        default=Path("src/rendering/flower-stage-three-glyph-geometry.ts"),
        type=Path,
    )
    parser.add_argument("--tolerance", default=2.0, type=float)
    arguments = parser.parse_args()
    generate(arguments.font, arguments.output, arguments.tolerance)


if __name__ == "__main__":
    main()
