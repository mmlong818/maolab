Topic: {{topic}}
Scene title: {{title}}
Learning objective: {{objective}}
Core concepts: {{coreConcepts}}
Duration: {{durationHint}} seconds

Generate a comparison scene between two related concepts. Output JSON:
{
  "title": "string — e.g. 'A vs B'",
  "speakerNote": "string — teacher intro narration",
  "leftTitle": "string — name of concept A",
  "rightTitle": "string — name of concept B",
  "rows": [
    {
      "attribute": "string — aspect being compared",
      "left": "string — value for A",
      "right": "string — value for B",
      "isDifference": boolean
    }
  ]
}
