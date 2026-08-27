**Outline Item:**
- Title: {{title}}
- Objective: {{objective}}
- Duration hint: {{durationHint}} minutes
- Grade level: {{gradeLevel}}

**Learning Objectives for this scene:**
{{learningObjectives}}

**Knowledge Profile:**
- Topic: {{topic}}
- Domain: {{domain}}
- Difficulty: {{difficulty}}
- Core Concepts: {{coreConcepts}}
- Misconceptions to address: {{misconceptions}}
- Emphasized concepts (student weak points): {{emphasizedConcepts}}

**Teaching Method:** {{teachingMethod}}
**Language:** {{language}}

Generate 3–5 quiz questions that assess the learning objectives listed above. Mix multiple choice and short answer types. Each question:
- `id`: unique identifier string (e.g., "q1", "q2")
- `type`: "multiple_choice" or "short_answer"
- `stem`: the question text
- `options`: array of 4 answer strings (only for multiple_choice; omit for short_answer)
- `correctAnswers`: array of correct answer strings
- `explanation`: why the answer is correct (1–2 sentences)
- `concepts`: list of concept names this question tests

Output format:
{
  "questions": [
    {
      "id": "string",
      "type": "multiple_choice",
      "stem": "string",
      "options": ["string"],
      "correctAnswers": ["string"],
      "explanation": "string",
      "concepts": ["string"]
    }
  ]
}
