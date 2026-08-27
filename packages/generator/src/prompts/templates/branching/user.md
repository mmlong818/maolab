Topic: {{topic}}
Domain: {{domain}}
Scene title: {{title}}
Learning objective: {{objective}}
Core concepts: {{coreConcepts}}
Teaching style: {{teachingStyle}}
Duration: {{durationHint}} seconds

Generate a branching scenario. Output JSON:
{
  "title": "string",
  "speakerNote": "string — narrator intro",
  "startNodeId": "string",
  "nodes": {
    "nodeId": {
      "type": "situation" | "consequence" | "end",
      "text": "string — scenario or outcome description",
      "choices": [
        { "id": "string", "text": "string", "nextNodeId": "string", "isCorrect": boolean }
      ],
      "feedback": "string — explanation shown at consequence node"
    }
  }
}
Note: node objects do NOT have an "id" field — the key in nodes IS the id.
