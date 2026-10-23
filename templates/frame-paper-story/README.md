# Paper Story

Original HyperFrames explainer template inspired by the layout and pacing of
[the user's reference Short](https://www.youtube.com/shorts/CptuxfOQE78).
Warm ivory paper, a fixed headline, a wide pencil illustration with a slow camera
push, and short caption groups with the current word in dark ink. No footage,
voice track, screenshots or channel marks from the reference are bundled.

Supports 9:16 (`compositions/portrait.html`), 16:9 (`index.html`) and 1:1
(`compositions/square.html`). All fonts and assets work without external CDNs.

| Input          | Description                                                                          |
| -------------- | ------------------------------------------------------------------------------------ |
| `headline`     | Persistent title; aim for <=80 characters, shared across scenes                      |
| `illustration` | `learning`, `overload`, or `balance`                                                 |
| `caption`      | Optional caption override; leave blank to use the scene's `voiceText`                |
| `brand`        | Optional small footer; blank by default to match the reference layout                |
| `accent`       | Current word color, hex; default warm dark ink                                       |
| `image`        | Optional PNG/JPEG/WebP data URI; Studio resolves uploaded `imageAsset` automatically |

The pipeline supplies `narrationText` and the measured `narrationSeconds`, and
renders this template for the full voice + scene hold. Other templates retain
their existing fixed-duration behavior. Caption word timing is an estimate
weighted by word length and punctuation, **not forced alignment**. For exact
word-level sync, the pipeline will need timestamped TTS or an alignment step.
A manual `caption` override may differ from the narration by design.

In Studio, select **Paper Story**, then **Áp dụng phong cách cho cả video**
to keep a shared headline and cycle the three illustrations across scenes.
Changing an illustration preset clears any custom image on that scene.

## Original illustration asset

[assets/sketch-scenes.png](assets/sketch-scenes.png) is an original generated sprite sheet: three equal
horizontal scenes, displayed with CSS background positioning. Generated with
the built-in `image_gen` tool; source generation was copied into this template.
No runtime image-generation API or API key is required.

Generation prompt:

> Use case: illustration-story. Asset type: a production sprite sheet of THREE pencil storyboard illustrations for a Vietnamese productivity explainer video template. Generate ONE portrait image, divided into exactly THREE equal-height horizontal panels stacked vertically, edge-to-edge with no gutters. Each panel is a complete wide landscape illustration, roughly 16:9 or 2:1. Consistent character across all three panels: an expressive adult stick-figure office worker with large round head, very simple thin body and limbs, small shirt collar, no specific real person. Monochrome warm graphite pencil line art, elegant fine outlines, subtle hand-drawn hatching and soft gray shading, pale warm ivory paper (#f9efd9) background. Clear perspective office interiors, readable strong silhouettes, uncluttered composition, generous breathing space. TOP PANEL: late night learning, worker at a laptop with a desk lamp, stacks of books, a mug, moon through window, curious slightly tired expression. MIDDLE PANEL: work overload, seated worker overwhelmed by stacks of paperwork and a standing manager gesturing toward more tasks; gentle relatable editorial humor. BOTTOM PANEL: healthy work balance, relaxed worker at tidy desk with one laptop, a small plant, sunlight through window, content confident expression. Draw whole scenes within each panel without cropping heads. No text, no letters, no labels, no speech bubbles, no logos, no watermark, no panel numbers, no color accents. The image will be cropped by CSS into three separate illustrations so keep every panel independent and exactly equal height. This is original illustration artwork, not a screenshot or UI mockup.
