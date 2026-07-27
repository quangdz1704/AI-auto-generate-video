# OmniVoice local server

The pipeline uses an OpenAI-compatible OmniVoice server at
`http://127.0.0.1:8123`. Its scene audio is WAV; FFmpeg produces the final
`voice.mp3` and `video.mp4`.

## Start the server

The project keeps an isolated Python environment at `.venv-omnivoice/`:

```bash
source .venv-omnivoice/bin/activate
omnivoice-server --host 127.0.0.1 --port 8123 --device cpu --num-step 16
```

Use `--num-step 32` when prioritizing quality over speed. Keep `127.0.0.1`
unless you deliberately need other machines on the network to reach the TTS
server.

## `script.json` voice modes

### Design a consistent voice

```json
"voice": {
  "provider": "omnivoice",
  "speed": 1,
  "mode": "design",
  "instructions": "female, young adult, moderate pitch",
  "numStep": 16,
  "positionTemperature": 0,
  "classTemperature": 0
}
```

`instructions` describes the voice. A server preset may be used instead with
`"voice": "nova"` or `"voice": "onyx"`. The two temperature values at `0`
make the selected voice repeatable across scenes.

### Clone an authorized reference voice

```json
"voice": {
  "provider": "omnivoice",
  "speed": 1,
  "mode": "clone",
  "referenceAudio": "../../assets/my-authorized-voice.wav",
  "referenceText": "Exact words spoken in my-authorized-voice.wav."
}
```

`referenceAudio` is resolved relative to the folder containing `script.json`.
Use only a recording you own or have explicit permission to clone. The same
audio and exact transcript are sent with every scene to keep the clone
consistent.

## Verify the server

```bash
curl --fail --silent --show-error \
  -X POST http://127.0.0.1:8123/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"model":"omnivoice","input":"Xin chao. Day la bai kiem tra.","response_format":"wav"}' \
  --output ./omnivoice-test.wav

afplay ./omnivoice-test.wav
```
