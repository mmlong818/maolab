Topic: {{topic}}
Domain: {{domain}}
Scene title: {{title}}
Learning objective: {{objective}}
Core concepts: {{coreConcepts}}
Duration: {{durationHint}} seconds
Grade level: {{gradeLevel}}

Generate a hotspot diagram scene. Output JSON with this exact shape:
{
  "title": "string — scene heading",
  "speakerNote": "string — 1-2 sentences teacher narration introducing the diagram",
  "svgDiagram": "string — inline SVG markup, viewBox 0 0 100 100",
  "hotspots": [
    {
      "id": "h1",
      "x": number,  // percentage of diagram width, 0–100 (NOT pixels)
      "y": number,  // percentage of diagram height, 0–100 (NOT pixels)
      "label": "short label",
      "description": "explanation of this part"
    }
  ]
}

IMPORTANT: x and y are percentage values from 0 to 100 representing the position within the diagram (0 = left/top edge, 100 = right/bottom edge). Do NOT use pixel coordinates. The svgDiagram should use viewBox="0 0 100 100" so SVG element positions correspond directly to these percentage values.
