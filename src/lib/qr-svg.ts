import QRCode from "qrcode";
import { frameLabel, type QrDesign } from "./qr-options";

/** Quiet zone around the code, in modules. */
const MARGIN = 2;
/** Average width of the badge font (bold sans-serif), as a share of the font size. */
const CHAR_WIDTH_EM = 0.62;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Dark modules as one path: a horizontal run of modules per `M…h…v1h…z` segment. */
function modulePath(text: string, ecc: QrDesign["ecc"]): { size: number; path: string } {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: ecc });
  const size = modules.size;
  let path = "";
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (!modules.get(y, x)) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < size && modules.get(y, x)) x += 1;
      path += `M${start + MARGIN} ${y + MARGIN}h${x - start}v1h-${x - start}z`;
    }
  }
  return { size, path };
}

/**
 * The single place a QR code is drawn as SVG. The server (downloads, API, PNG rasterisation) and the
 * browser preview both call this, so what you see in the dialog is exactly what you download.
 * `pixelWidth` adds an intrinsic size, which the PNG rasteriser needs; plain SVG stays scalable.
 */
export function composeQrSvg(text: string, design: QrDesign, options: { pixelWidth?: number } = {}): string {
  const { size: modules, path } = modulePath(text, design.ecc);
  const side = modules + MARGIN * 2;
  const badge = design.frame === "badge";

  const badgeHeight = modules * 0.16;
  const width = side;
  const height = badge ? side + badgeHeight + MARGIN : side;
  const pixelHeight = options.pixelWidth ? Math.round((options.pixelWidth * height) / width) : 0;
  const sizeAttrs = options.pixelWidth ? ` width="${options.pixelWidth}" height="${pixelHeight}"` : "";

  let body =
    `<rect width="${width}" height="${height}" fill="${design.bg}"/>` +
    `<path fill="${design.fg}" d="${path}"/>`;

  if (badge) {
    const label = frameLabel(design.frameText);
    const chars = Array.from(label).length;
    const maxTextWidth = modules * 0.86;
    const fontSize = Math.min(badgeHeight * 0.5, maxTextWidth / (chars * CHAR_WIDTH_EM));
    const top = side;
    const baseline = top + badgeHeight / 2 + fontSize * 0.35;
    body +=
      `<rect x="${MARGIN}" y="${top}" width="${modules}" height="${badgeHeight}" rx="${badgeHeight / 2}" fill="${design.fg}"/>` +
      `<text x="${side / 2}" y="${baseline}" text-anchor="middle" font-family="Helvetica, Arial, DejaVu Sans, sans-serif" font-weight="700" font-size="${fontSize}" fill="${design.bg}">${escapeXml(label)}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"${sizeAttrs} shape-rendering="crispEdges">${body}</svg>`;
}
