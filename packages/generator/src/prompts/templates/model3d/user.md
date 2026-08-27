Topic: {{topic}}
Domain: {{domain}}
Scene title: {{title}}
Learning objective: {{objective}}
Core concepts: {{coreConcepts}}
Duration: {{durationHint}} seconds
Grade level: {{gradeLevel}}
Language: {{language}}

Generate metadata for a 3D model scene. The modelUrl will be provided by the teacher — set it to empty string "".

Output JSON with this exact shape:
{
  "title": "string — scene heading (in {{language}})",
  "speakerNote": "string — 1-2 sentences teacher narration introducing the 3D model (in {{language}})",
  "description": "string — 2-3 sentences describing what students should observe and learn from the model (in {{language}})",
  "modelUrl": "",
  "motionProfile": "specimen" | "road" | "aircraft" | "vessel" | "product" | "orbit"
}
