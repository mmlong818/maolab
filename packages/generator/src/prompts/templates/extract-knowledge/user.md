**Topic:** {{topic}}
**Domain hint:** {{domain}}
**Difficulty:** {{difficulty}}
**Emphasized concepts (student weak points):** {{emphasizedConcepts}}

Extract the following fields:
- `topic`: the exact topic string
- `domain`: academic domain (e.g., physics, history, programming)
- `difficulty`: one of beginner / intermediate / advanced
- `coreConcepts`: 3–7 core concepts, each with a `name` and one-sentence `desc`
- `causalChain`: ordered list of 3–6 cause-effect relationships (strings)
- `misconceptions`: 2–4 common misconceptions learners have about this topic (strings)
- `narrativeHooks`: 2–3 engaging story hooks or surprising facts (strings)
- `analogies`: 2–3 analogies that map this topic to everyday life (strings)
- `keyFigures`: 0–3 key historical figures or contributors (strings, can be empty)
- `emphasizedConcepts`: copy from input
- `prerequisites`: 0–5 prerequisite knowledge topics a learner should already know before studying this topic (strings, can be empty)

Output format:
{
  "topic": "string",
  "domain": "string",
  "difficulty": "beginner",
  "coreConcepts": [{ "name": "string", "desc": "string" }],
  "causalChain": ["string"],
  "misconceptions": ["string"],
  "narrativeHooks": ["string"],
  "analogies": ["string"],
  "keyFigures": ["string"],
  "emphasizedConcepts": ["string"],
  "prerequisites": ["string"]
}
