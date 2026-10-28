/**
 * The browser snippet for conversion tracking: `<script src="https://…/api/convert/snippet.js"></script>`.
 * It remembers the `vclid` the visitor arrived with (in the destination site's own sessionStorage; Vialb sets
 * no cookies) and exposes `vialb.convert({ value, currency })` to report a conversion.
 */
const SNIPPET = `(function () {
  var script = document.currentScript;
  if (!script || !script.src) return;
  var endpoint = new URL(script.src).origin + "/api/convert";
  var KEY = "vialb_vclid";
  var ID = /^[A-Za-z0-9_-]{16}$/;
  try {
    var seen = new URLSearchParams(location.search).get("vclid");
    if (seen && ID.test(seen)) sessionStorage.setItem(KEY, seen);
  } catch (e) {}
  window.vialb = window.vialb || {};
  window.vialb.convert = function (options) {
    options = options || {};
    var id;
    try { id = sessionStorage.getItem(KEY); } catch (e) {}
    if (!id) return false;
    var data = new URLSearchParams({ cid: id });
    if (options.value !== undefined && options.value !== null) data.set("value", String(options.value));
    if (options.currency) data.set("currency", String(options.currency));
    if (navigator.sendBeacon && navigator.sendBeacon(endpoint, data)) return true;
    new Image().src = endpoint + "?" + data.toString();
    return true;
  };
})();
`;

export function GET() {
  return new Response(SNIPPET, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
