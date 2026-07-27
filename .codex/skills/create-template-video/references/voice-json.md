# Script and voice reference

Use this base shape. Read `templates/CATALOG.md` in this repository for the
required `inputs` of every template.

```json
{
  "version": "1.0",
  "renderer": "hyperframes",
  "aspect": "9:16",
  "metadata": {
    "title": "...",
    "source": { "url": "...", "domain": "...", "image": null },
    "channel": "AI Coding"
  },
  "voice": {
    "provider": "omnivoice",
    "speed": 1,
    "mode": "design",
    "instructions": "female, young adult, moderate pitch",
    "numStep": 16,
    "positionTemperature": 0,
    "classTemperature": 0
  },
  "scenes": [
    { "id": "hook", "type": "hook", "voiceText": "...", "templateId": "frame-liquid-bg-hero", "inputs": {} },
    { "id": "body-1", "type": "body", "voiceText": "...", "templateId": "frame-vignelli", "inputs": {} },
    { "id": "outro", "type": "outro", "voiceText": "...", "templateId": "frame-logo-outro", "inputs": {} }
  ]
}
```

## Voice modes

`design` describes a generated voice. `instructions` overrides a preset
`voice` such as `nova` or `onyx`. Set both temperature fields to `0` for a
stable voice across scenes. `numStep` accepts 1–64; 16 is faster and 32
prioritizes quality.

`clone` needs an authorized recording and its exact transcript:

```json
{
  "provider": "omnivoice",
  "speed": 1,
  "mode": "clone",
  "referenceAudio": "../../assets/my-authorized-voice.wav",
  "referenceText": "Exact words spoken in my-authorized-voice.wav."
}
```

Resolve `referenceAudio` relative to the directory containing `script.json`.
The pipeline sends the same reference for every scene. Never clone a person
without clear permission.
