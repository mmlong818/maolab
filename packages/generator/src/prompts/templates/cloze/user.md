Topic: {{topic}}
Scene title: {{title}}
Learning objective: {{objective}}
Core concepts: {{coreConcepts}}
Duration: {{durationHint}} seconds

Generate a cloze exercise. Output JSON:
{
  "instruction": "string — task description for student",
  "speakerNote": "string — teacher narration",
  "segments": [
    { "kind": "text", "text": "string" } |
    { "kind": "blank", "id": "b1", "answer": "string", "hint": "optional short clue" }
  ]
}
Alternate text and blank segments to form coherent sentences.
