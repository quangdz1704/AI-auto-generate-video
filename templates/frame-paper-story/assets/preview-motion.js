// Studio-only playback driver. HyperFrames render never loads this file:
// the composition itself advances exclusively through deterministic seek(t).
(function () {
  var timeline = window.__timelines && window.__timelines.main;
  if (!timeline) return;
  var start;
  function tick(now) {
    if (start === undefined) start = now;
    timeline.seek(((now - start) / 1000) % timeline.duration());
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
