/* Two families of flexible, closed strands sharing a moving spatial spine.
   Nearer strands pass in front of the Earth. The sphere occludes the rear sweep. */
function drawMantle(view) {
  const { ctx: c, cx, cy, radius: r } = view;
  const time = view.time * 0.27,
    low = view.energy[0],
    high = view.energy[2];
  const turn = view.lon * view.rad,
    tilt = -0.52 + 0.1 * Math.sin(turn),
    cs = Math.cos(tilt),
    sn = Math.sin(tilt);
  // Attacks pull the strands taut. Sustained sound opens a wider, slower fold.
  const strike = view.strike || 0,
    hold = view.hold || 0;
  const measured = view.listening && view.signal?.analyser;
  const gain = measured ? 0.48 + Math.min(1, view.loudness * 3) * 0.62 : 1;
  const flight = (1 - view.flightScale) * 8;
  const colors = [
    [
      [115, 145, 242],
      [207, 193, 250],
      [252, 183, 125],
    ],
    [
      [124, 183, 207],
      [205, 222, 232],
      [255, 229, 187],
    ],
  ];
  c.save();
  c.globalCompositeOperation = "lighter";
  for (let family = 0; family < 2; family++) {
    const count = family ? 19 : 42,
      stops = colors[family],
      gradient = c.createLinearGradient(
        cx - r,
        cy + r * 0.4,
        cx + r,
        cy - r * 0.4,
      );
    gradient.addColorStop(0, "rgb(" + stops[0] + ")");
    gradient.addColorStop(0.54, "rgb(" + stops[1] + ")");
    gradient.addColorStop(1, "rgb(" + stops[2] + ")");
    c.strokeStyle = gradient;
    for (let row = 0; row < count; row++) {
      const u = row / (count - 1) - 0.5,
        angle = time * 0.27 + family * 1.66;
      c.lineWidth = Math.max(0.42, r * 0.0015) * (row % 11 === 0 ? 1.65 : 1);
      c.globalAlpha =
        (family ? 0.18 : 0.34) *
        (0.5 + 0.5 * Math.cos(u * 2.6)) *
        (1 + high * 0.3 + strike * 0.42) *
        gain;
      let pen = false;
      c.beginPath();
      for (let j = 0; j <= 146; j++) {
        const t = (j * Math.PI * 2) / 146,
          C = Math.cos(t),
          S = Math.sin(t);
        const curl = Math.sin(2 * t - angle + turn * 0.42),
          fold = Math.cos(3 * t + angle * 0.7);
        const widen =
          (0.12 + 0.22 * (0.5 + 0.5 * curl)) *
          (1 + low * 0.25 + hold * 0.95 - strike * 0.56 + flight * 0.4);
        const band = u * widen;
        const dist =
          1.005 +
          0.14 * Math.cos(2 * t - 0.52 + angle * 0.23) +
          0.07 * fold +
          band * Math.cos(2 * t + angle);
        const x = C * dist;
        const y =
          S * (family ? 0.62 : 0.43) +
          (0.19 + 0.075 * hold - 0.045 * strike) * curl +
          0.075 * fold +
          band * (1.1 + 0.55 * Math.sin(t - angle)) +
          family * 0.075;
        const z = S * 0.95 + 0.16 * curl + band;
        const visible = z > 0 || x * x + y * y > 1.007;
        if (visible) {
          const dx = cx + r * (cs * x - sn * y),
            dy = cy + r * (sn * x + cs * y);
          if (pen) c.lineTo(dx, dy);
          else c.moveTo(dx, dy);
        }
        pen = visible;
      }
      c.stroke();
    }
  }
  c.restore();
}
