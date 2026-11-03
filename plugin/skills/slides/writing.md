# Writing a deck

Read this before writing or editing any copy in a `deck.ts`. These rules were learned on decks
that went in front of clients, mostly by writing the wrong version first.

## A slide is read in about three seconds, and then they look at you

That is the whole brief. Someone in a meeting glances at a new slide, decides what it is, and
looks back at the person talking. They do not read it. The test for any slide: **glance at it,
look away, say what it claimed.** If you cannot, the slide has not done its job, however
accurate every word on it is.

## Write it in this order

1. **The deck's `job`**: what the meeting has to achieve, in one sentence.
2. **Each section's and slide's `job`**: what it has to do to the room. If you cannot say what a
   slide is for, no amount of copy fixes it. Read the jobs top to bottom: you should hear the
   argument. Where you cannot, the deck has a hole, and that is the cheapest moment to find it.
3. **The headline**, as the sentence you would say standing up. The argument goes here and only
   here.
4. **The eyebrow**, as the plainest true label for what the slide is.
5. The paragraph you think you need. Then move it to `handout` and look at the slide without
   it. Put back only what the slide cannot say without words. Usually that is nothing.

A `job` is a test, never a source: nothing is generated from it, and you never rewrite a
headline to match a job automatically. Its value is being the fixed thing the copy is checked
against.

## The deck's header note

Open every `deck.ts` with a block comment, because comments are stripped from the bundle and
this is the only place the reasoning survives. Write it for the next person (or agent) who
edits the deck. Useful headings, in capitals so they can be found:

- **WHO IT IS FOR** and what the meeting has to achieve.
- **WHERE IT CAME FROM**: written from scratch, or based on which earlier deck, and what changed.
- **WHY IT LOOKS THIS WAY**: the theme and any rule the deck follows for pictures.
- **THE ORDER IS THE ARGUMENT**, when it is: for example, building to the price rather than
  opening with it, so the number arrives as an answer instead of something to defend.
- **WHAT THIS DECK MAY NOT CLAIM**: the things an earlier draft got wrong or that are not true
  yet. Put a note like this directly above any slide that makes a claim someone could check,
  so a later edit cannot quietly reintroduce it.
- **THE PICTURES**: where each set came from, and which are still placeholders to replace
  before sending.

A related habit: when part of a story should not be forwarded (a price, a commercial term),
make it a separate deck with its own slug rather than a section of the first.

## The eyebrow says where you are. The headline says the takeaway

- **Eyebrow: a signpost.** Plain nouns are correct and usually best: "Product overview", "The
  terms", "Founding team". Two claims on one slide (one in the eyebrow, one in the headline)
  compete for a slide that is allowed one idea.
- **Headline: the conclusion, not the setup.** Someone who reads only the headlines should still
  have the argument.

| Setup, so the reader waits | Takeaway, so the reader has it |
| --- | --- |
| "You cannot shoot until the sample arrives." | "Publishable before the stock arrives." |
| "Speed" | "Live in a day, not a month." |

- **The headline has to read cold.** Cover the rest of the slide and read only the headline. A
  line that points at things nobody has been shown yet ("Three walls, and the third is the one
  that matters") is a caption for a picture, not a headline. This matters most on slides that
  build: when the headline is on screen, the things it refers to may not have arrived.
- **Not every slide has a takeaway.** A divider, an agenda or a reference page names the thing
  plainly and stops. Forcing a claim onto one is theatre.
- **On a slide that builds to a payoff**, the headline still reads cold, but it must not give the
  payoff away: it states the claim the payoff will prove, or names the question plainly. "What a
  year of this costs" over a sum that builds to the answer; "Three places to photograph a
  garment, and two are weeks earlier" over a timeline that builds. It must never point at
  things that are not on screen yet ("the third one is the one that matters").

## No terms of art, no invented phrases

The strictest test here: **would someone who has never seen this deck know exactly what this
means, the first time, without being told?** "Weeks you already own" fails. So does a rhetorical
question doing a label's job, and so does a slogan that is fine in a blog post and theatrical on
a section divider. They all perform having a point instead of making one. The tell: you could
not say it out loud to one person without them asking what you meant. Say the thing.

## Budgets

| What | Aim for | Hard stop |
| --- | --- | --- |
| Eyebrow | under 24 characters | one line, always |
| Headline | under 60 characters | never three lines |
| Body (`paragraph`, `note`) | under 120 characters | 240, which the build reports |
| `handout` | two or three sentences | 320, where the build fails |

A 400-character paragraph is twenty seconds of a room reading instead of listening.

## Plain words, and sober rather than sold

- Write it the way you would say it standing up: "would a real person, talking out loud, say
  this?"
- No dashes as sentence punctuation. A period, a comma, a colon, or a plain "and" or "but".
- No "it's not X, it's Y". No lists of three reached for only for rhythm. No throat-clearing
  openers. No runs of bold-phrase-colon-definition bullets.
- **Concrete beats abstract.** "You are waiting on a box" beats "sample logistics introduce
  latency". Name the actual object.
- **No metaphor that has to be decoded.**
- **Curly quotes in slide copy** are correct typography on a typeset slide; use them there.

**Sober, not sold.** A deck usually goes to someone looking at evidence: pictures, measurements,
a price. A sentence that praises the achievement competes with the proof and makes the proof look
like it needs help. The test: **could the client disagree with it?** "Photography, reimagined"
asserts nothing, so it cannot be argued with, and that is what makes it dead. "One brief covers
all 9,000 images" is a claim, so the room can engage with it.

- No adjective about your own quality: seamless, powerful, unmatched, effortless.
- No verb that congratulates you: revolutionises, transforms, unlocks.
- No sentence that would need a logo under it to make sense. That is an ad.

Sober is not timid. A checkable number is the most aggressive thing a slide can carry.

## Numbers

- **A number says what it measures, on the slide.** "5 min of setup a shot" needs the unit and
  what "setup" covers, or the figure is arguable. Put the explanation in `handout` too.
- **Check a figure against anything already published** (your website, earlier decks, a
  proposal) before it goes on a slide. Two of your own numbers that disagree are a question you
  hand the client.
- **Make the room do the arithmetic.** A number someone worked out themselves is believed; one
  they were handed is checked. A sum that builds factor by factor and holds on "= ?" before the
  answer (a `scene`, see scenes.md) lands harder than three tiles with the result.
- **The engine never adds money up.** Every total in a `quote` block is written by hand, so
  check it against its lines yourself, every time a line changes.

## Their words beat yours

If the client said it in an email or a meeting, use their sentence: it is more persuasive than
anything you would write and they cannot argue with it. The same goes for their objection: if
they are known to say "we already tried that", concede it generously. A slide that rubbishes a
tool they like is arguing with the room.

## Where the rest goes

| Put it | When |
| --- | --- |
| On the slide | it should be seen in three seconds and pointed at |
| `handout` | the sentence you would have said out loud, for whoever opens the PDF alone |
| `job` | why the slide exists. Internal, never ships |
| Out loud | most of it |

**A narrated deck** (a keynote-style talk with very few words on screen) can carry the whole
talk in `handout`: there is no presenter-notes field, and handout never shows on screen, so the
PDF reads as the talk. Export a copy without the band for people who do not need it:
`NOTES=off npx slides pdf <deck>` writes `decks/<deck>/<deck>-no-notes.pdf` beside the normal one.

## A good copy edit is usually a deletion

Most slides get better by cutting, not by rewriting. If a proposed change adds a phrase that was
not there before, be suspicious of it. Typical result: a 375-character slide becomes 229 by
removing the `note` the drawing already said, and nothing was invented.
