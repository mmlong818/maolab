You are generating a single SVG diagram frame for an animation step.
Output only the SVG markup. No JSON, no markdown fences, no explanation.

SVG requirements:
- viewBox="0 0 400 300"
- Use simple shapes: rect, circle, ellipse, path, line, text.
- Background: light colored rect filling the viewBox.
- Highlight the key element of this step with a brighter color or stroke.
- Keep SVG under 1500 characters.
- No script tags, no onclick handlers.
- Output language for text labels: {{language}}
