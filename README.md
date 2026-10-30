# Oxygen Journey

Interactive Three.js GCSE / KS3 biology lesson: follow oxygen from air into a cell and out as CO₂.

Tour → Hands-on → Check yourself across 10 levels. Built on the cloud computer with the official Anthropic Claude API (Opus). Preview for a future SkillBay skill.

## Develop

```bash
npm install
npm run dev
npm run build
```

## Levels

1. Breathe In · 2. The Tree · 3. Unfold · 4. The Swap · 5. The Ride · 6. The Pump · 7. Two Loops · 8. Burn · 9. Run! · 10. Out

## Deploy

```bash
npm run build
npx wrangler pages deploy dist --project-name oxygen-journey
```
