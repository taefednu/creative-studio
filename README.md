# Mentorium Creative Studio

A creative space for kids aged 5–12, with Meta models checking everything a child sees. Kids pick a style, say or type an idea, and get a picture. They can bring a paper drawing to life, turn it into a short illustrated story, and share work with their class or family.

Live demo: **https://studio.mentorium.uz**. The login page has one-click buttons for a school child, a family child, a parent and a teacher. All accounts, names and pictures on the demo are synthetic. It is not meant for real children: anyone can open the demo parent and teacher accounts, so please don't upload real photos.

Built for the Meta Global AI Developer Hackathon. The first commit is dated October 29, 2026, and the code in this repo was written during the event. The logo and app icons are existing Mentorium brand assets. Mentorium's learning platform is a separate product and none of its code is here. This repo only holds a client for its API, tested against a fake server. The demo runs without it.

## How the models are used

| Model | Job |
|---|---|
| Muse Spark | Classifies prompts, captions, comments, nicknames and generated images into safety categories, returning strict JSON. Writes story text. |
| Muse Image | Generates pictures from templates and edits a child's drawing into an illustration. |
| SAM 3.1 | Finds faces, school uniforms, house numbers and handwritten names on uploads, so the app can blur real faces and text before other kids see them. The reviewing adult can also see the original. Faces in drawings stay unblurred, because they aren't real people. |
| Muse Voice Transcribe | Voice input for kids who can't type yet. Tested with fake audio devices and files; a real microphone is still unverified. |

Model ids come from settings (`backend/.env.example`), and the code contains none.

## The safety rule

The model classifies and the code decides. If the answer is late, fails the schema, or the API returns an error, the item goes to an adult. It never goes through by default.

- **Prompts and comments:** a risky comment gets a "say it kinder?" suggestion, or waits for an adult with the reason shown.
- **Self-harm signals:** the child gets a supportive message, never "blocked", and the adult sees an urgent alert above the screen.
- **Who reviews what:** a parent approves personal work and a teacher approves class posts. A share link stays closed until an adult opens it.
- **Untrusted text:** a child's text is fenced in the prompt as data, so "ignore your rules" stays a piece of text.

## Evaluation

There are 540 synthetic labeled texts in Russian, English and Uzbek, split into `dev` and `test`. Prompts are tuned only on `dev`. The set isn't strictly blind any more: we compared code variants on `test` and read its misses, without changing prompts from them. Latest test run (270 examples, November 4):

| Category | Precision (ru / en / uz) | Recall (ru / en / uz) |
|---|---|---|
| personal_info | 100 / 100 / 100 | 100 / 100 / 100 |
| off_platform_contact | 79 / 77 / 80 | 92 / 83 / 100 |
| bullying | 90 / 90 / 82 | 100 / 100 / 100 |
| unsafe_content | 100 / 100 / 100 | 100 / 100 / 78 |
| self_harm | 100 / 100 / 100 | 100 / 100 / 100 |
| prompt_injection | 100 / 100 / 100 | 100 / 100 / 100 |

Across two runs, 1.9% and 2.5% of unsafe examples got through. The table shows the first run. One later tightening, which sends late "rewrite" and "say it kinder" answers to an adult, wasn't measured again. Known gaps: phrases like "go to my channel" sometimes pass as off-platform contact, and the model can give different answers on the same input. Details and the runs behind these numbers are in `evals/results/`.

## Run it locally

You need Python 3.12, `uv`, Node 20 and `pnpm`, plus a Meta Model API key.

```bash
cd backend
cp .env.example .env
uv sync
DEMO_LOGIN=true uv run python scripts/seed_demo.py
DEMO_LOGIN=true uv run uvicorn app.main:app --port 8100
```

Fill in `.env` first: `MODEL_API_KEY`, the `MODEL_*` ids and a `SESSION_SECRET` of 32 characters or more. In a second terminal:

```bash
cd frontend
pnpm install
pnpm dev
```

Open http://localhost:5180. Tests: `uv run pytest` in `backend`, `pnpm test:unit` in `frontend`. The `Dockerfile` builds the whole app into one container.

## Layout

| Path | What |
|---|---|
| `backend/app/safety` | Classification, the strict schema, and the code that decides |
| `backend/app/works` | Pictures, uploads and blurring, remix, stories, share links |
| `backend/app/feed`, `moderation`, `parent`, `assignments` | Feed, adult review queue, parent cabinet, teacher tasks |
| `frontend/src` | React app in Russian, English and Uzbek |
| `evals/` | Labeled sets, the scoring script, saved results |
| `docs/` | Design references and the story feature spec |
