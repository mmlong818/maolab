Topic: {{topic}}
Scene title: {{title}}
Learning objective: {{objective}}
Core concepts: {{coreConcepts}}
Duration: {{durationHint}} seconds

Generate a drag-drop classification exercise. Output JSON:
{
  "instruction": "string — task instruction for student",
  "speakerNote": "string — teacher narration",
  "items": [{ "id": "i1", "text": "string" }],
  "targets": [{ "id": "t1", "label": "string" }],
  "matches": { "i1": "t1", "i2": "t2" }
}
Note: matches maps item id → target id for every item.
