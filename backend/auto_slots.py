# ------------------------------------------------------------
# auto_slots.py - find parking spaces automatically
#
# Two methods are combined:
# A) PAINTED LINES (OpenCV): white stall lines are found with the
#    Hough transform; the area between two neighbouring parallel
#    lines is one parking space. Works even when the lot is empty.
# B) PARKED CARS (YOLO): cars stand side by side in rows with about
#    the same distance between them (the "pitch").
#      * every detected car -> one parking space
#      * a gap in a row as wide as 1 or more pitches -> that many
#        more spaces
#    Gap spaces are NOT assumed to be free: the detector decides
#    their status like any slot (YOLO + visual check), so a car that
#    YOLO missed (e.g. under a tree) still makes its space occupied.
# ------------------------------------------------------------
import cv2
import numpy as np


def car_geometry(poly):
    """centre, unit vector along the row (= car's short side), car width, car length."""
    p = np.asarray(poly, dtype=np.float32)
    centre = p.mean(axis=0)
    edge1, edge2 = p[1] - p[0], p[2] - p[1]
    len1, len2 = float(np.linalg.norm(edge1)), float(np.linalg.norm(edge2))
    if len1 < len2:
        return centre, edge1 / len1, len1, len2
    return centre, edge2 / len2, len2, len1


def space_polygon(centre, row_dir, width, length):
    """4 corners of a parking space centred on 'centre', turned like the row."""
    across = np.array([-row_dir[1], row_dir[0]])  # along the car's length
    w, l = row_dir * width / 2, across * length / 2
    return np.array([centre - w - l, centre + w - l, centre + w + l, centre - w + l],
                    dtype=np.float32)


# ---------------- method B: parked cars ----------------

def find_car_spaces(car_polys):
    """A space around every detected car.
    Also returns 'hints' for method A: the directions the parked cars point in
    (= direction of the painted stall lines), the usual space width (pitch) and
    the usual car length."""
    cars = [car_geometry(p) for p in car_polys]
    if not cars:
        return [], None

    # 1) for every car, find the next car beside it in the same row
    pairs = []  # (car i, car j, distance between them along the row)
    for i, (c_i, dir_i, w_i, l_i) in enumerate(cars):
        side = np.array([-dir_i[1], dir_i[0]])
        best = None
        for j, (c_j, dir_j, _, _) in enumerate(cars):
            if j == i or abs(float(dir_i @ dir_j)) < 0.9:
                continue  # same car, or parked at another angle -> another row
            along = float((c_j - c_i) @ dir_i)        # distance along the row
            sideways = abs(float((c_j - c_i) @ side))  # distance out of the row
            if along > 0 and sideways < 0.25 * l_i and (best is None or along < best[1]):
                best = (j, along)
        if best:
            pairs.append((i, best[0], best[1]))

    # 2) pitch = usual distance between two neighbouring cars = width of a space
    width = float(np.median([w for _, _, w, _ in cars]))
    close = [d for _, _, d in pairs if d < 1.6 * width]
    pitch = float(np.median(close)) if close else 1.25 * width

    # 3) a space around every car, 90 % of the pitch wide so neighbours don't touch
    spaces = [space_polygon(c, d, pitch * 0.9, l) for c, d, _, l in cars]

    # 4) hints: the different directions cars are parked in (lines run the same way)
    angles = []
    for _, d, _, _ in cars:
        angle = np.degrees(np.arctan2(d[0], -d[1])) % 180  # direction of the car's length
        if all(abs((angle - a + 90) % 180 - 90) > 8 for a in angles):
            angles.append(angle)
    hints = {"angles": angles, "pitch": pitch,
             "length": float(np.median([l for _, _, _, l in cars]))}
    return spaces, hints


# ---------------- method A: painted lines ----------------

def find_painted_spaces(frame, hints=None, car_polys=()):
    """Find parking spaces between parallel white painted lines.
    hints (from method B) say in which directions the stall lines run, how far
    apart they are and how long a space is; without them the directions are guessed.
    Returns a list of 4-corner polygons in full-picture pixels."""
    scale = 1000 / max(frame.shape[:2])     # work on a ~1000 px copy (fast, same result)
    small = cv2.resize(frame, None, fx=scale, fy=scale)
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    saturation = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)[:, :, 1]
    size = max(gray.shape)
    car_angles = hints["angles"] if hints else None
    pitch_small = hints["pitch"] * scale if hints else None
    length_small = hints["length"] * scale if hints else None

    # 1) paint = WHITE pixels (little colour) that are much brighter than their surroundings.
    #    When the cars tell us the line direction, junk is filtered later, so slightly
    #    cream / yellowed paint (warm photo filters) is allowed too.
    max_saturation, min_brighter, votes = (90, 30, 30) if car_angles else (50, 35, 40)
    background = cv2.GaussianBlur(gray, (0, 0), 15)
    paint = (((gray.astype(int) - background) > min_brighter) & (saturation < max_saturation))
    paint = paint.astype(np.uint8) * 255
    # white / silver cars are also "white and bright" -> blank out every detected car
    for poly in car_polys:
        cv2.fillPoly(paint, [(np.asarray(poly) * scale).astype(np.int32)], 0)

    # 2) straight lines (maxLineGap joins the pieces of dashed lines)
    min_length = length_small * 0.5 if length_small else size * 0.08
    found = cv2.HoughLinesP(paint, 1, np.pi / 180, threshold=votes,
                            minLineLength=int(min_length), maxLineGap=int(size * 0.03))
    if found is None:
        return []
    lines = []
    for x1, y1, x2, y2 in found.reshape(-1, 4).astype(float):
        angle = np.degrees(np.arctan2(y2 - y1, x2 - x1)) % 180
        lines.append((angle, np.array([x1, y1], float), np.array([x2, y2], float)))

    # 3a) directions known from the parked cars -> look for spaces in all of them
    if car_angles:
        spaces = []
        for angle in car_angles:
            spaces += spaces_between_lines(lines, angle, size, pitch_small, length_small)
        return [s / scale for s in remove_inner_spaces(spaces)]  # back to full-size pixels

    # 3b) no cars: strongest line directions (kerbs, stall lines, car edges ...)
    weights = np.zeros(180)
    for angle, p1, p2 in lines:
        weights[int(angle) % 180] += np.linalg.norm(p2 - p1)
    weights = sum(np.roll(weights, k) for k in (-2, -1, 0, 1, 2))  # smooth +-2 degrees
    candidates = []
    for _ in range(3):
        best = int(np.argmax(weights))
        if weights[best] == 0:
            break
        candidates.append(best)
        for k in range(-10, 11):  # ignore directions close to this one next time
            weights[(best + k) % 180] = 0

    # 4) the direction that gives the most parking spaces is the stall-line direction
    best_spaces = max((spaces_between_lines(lines, a, size) for a in candidates), key=len)
    return [s / scale for s in best_spaces]  # back to full-size pixels


def spaces_between_lines(lines, angle_deg, size, pitch=None, car_length=None):
    """Parking spaces formed by the lines that run in direction angle_deg.
    pitch / car_length (if known) = expected width / length of a space."""
    angle = np.radians(angle_deg)
    along = np.array([np.cos(angle), np.sin(angle)])
    across = np.array([-along[1], along[0]])

    # describe each line by its position across the stalls (offset)
    # and where it starts / ends along itself (t1, t2)
    stall_lines = []
    for a, p1, p2 in lines:
        if abs((a - angle_deg + 90) % 180 - 90) <= 8:
            t = sorted([p1 @ along, p2 @ along])
            stall_lines.append([float((p1 + p2) @ across / 2), t[0], t[1]])
    stall_lines.sort()

    # pieces of the same painted line (close offset, overlapping) -> one line
    merged = []
    for offset, t1, t2 in stall_lines:
        for m in merged:
            if abs(offset - m[0]) < size * 0.012 and t1 <= m[2] + size * 0.03 and t2 >= m[1] - size * 0.03:
                m[0] = (m[0] + offset) / 2
                m[1], m[2] = min(m[1], t1), max(m[2], t2)
                break
        else:
            merged.append([offset, t1, t2])
    merged.sort()

    # each line + the next line beside it (that runs next to it) = one parking space
    spaces = []
    for i, (o1, a1, a2) in enumerate(merged):
        for o2, b1, b2 in merged[i + 1:]:
            start, end = max(a1, b1), min(a2, b2)  # part where both lines exist
            if end - start < 0.6 * max(a2 - a1, b2 - b1):
                continue  # not side by side, or much shorter (another row, edge of a car ...)
            width, length = o2 - o1, end - start
            if pitch:
                # we know how wide a space is: the next line must be about one pitch away
                if width < 0.6 * pitch:
                    continue  # too close: edge of a car, double line ...
                # ... and a space is about as long as a car
                is_space = width <= 1.5 * pitch and 0.6 * car_length <= length <= 1.5 * car_length
            else:
                # a real parking space is about 1.5 - 3.5 times longer than it is wide
                if length / width > 3.5:
                    continue  # too narrow: probably not a stall line (e.g. edge of a car)
                # not a tiny shape, and not bigger than a parking space can be in a photo
                is_space = length / width >= 1.5 and size * 0.025 <= width <= size * 0.25
            if is_space:
                spaces.append(np.array([o1 * across + start * along, o2 * across + start * along,
                                        o2 * across + end * along, o1 * across + end * along],
                                       dtype=np.float32))
            break  # only the nearest real neighbouring line
    return remove_inner_spaces(spaces)


def remove_inner_spaces(spaces):
    """Drop a space whose centre lies inside another, bigger space (duplicate)."""
    keep = []
    for s in spaces:
        centre = tuple(float(v) for v in s.mean(axis=0))
        inside_bigger = any(
            cv2.contourArea(o) > cv2.contourArea(s) and cv2.pointPolygonTest(o, centre, False) >= 0
            for o in spaces if o is not s)
        if not inside_bigger:
            keep.append(s)
    return keep


def misaligned(space, car_spaces):
    """True if the space cuts through a car's space without holding that car
    (a real space around a car contains the car's centre)."""
    area = cv2.contourArea(space)
    for car in car_spaces:
        overlap, _ = cv2.intersectConvexConvex(space, car)
        centre = tuple(float(v) for v in car.mean(axis=0))
        if overlap > 0.25 * area and cv2.pointPolygonTest(space, centre, False) < 0:
            return True
    return False


def merge_spaces(line_spaces, car_spaces):
    """Painted-line spaces are the most exact. Add a car-based space only where
    no painted-line space exists yet."""
    if car_spaces:
        # a painted-line "space" much bigger or smaller than a car space is not a
        # parking space (e.g. two long kerb lines) -> drop it
        typical = float(np.median([cv2.contourArea(s) for s in car_spaces]))
        line_spaces = [s for s in line_spaces
                       if 0.4 * typical <= cv2.contourArea(s) <= 2 * typical
                       and not misaligned(s, car_spaces)]
    result = list(line_spaces)
    for space in car_spaces:
        centre = space.mean(axis=0)
        width = min(np.linalg.norm(space[1] - space[0]), np.linalg.norm(space[2] - space[1]))
        if all(np.linalg.norm(centre - s.mean(axis=0)) > 0.6 * width for s in result):
            result.append(space)
    return result


def sort_spaces(spaces):
    """Order spaces top-to-bottom by row, then left-to-right (for names P1, P2, ...)."""
    if not spaces:
        return []
    row_height = float(np.median([np.ptp(s[:, 1]) for s in spaces]))
    return sorted(spaces, key=lambda s: (round(s[:, 1].mean() / row_height), s[:, 0].mean()))
