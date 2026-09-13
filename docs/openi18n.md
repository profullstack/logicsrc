# OpenI18n

OpenI18n is one file a service serves about the languages it speaks: which ones, which it can turn into which, how a reader asks for anything in one of them, and where texts are sent to be translated. A reader learns what a site or an API can say in Swedish before asking, a directory lists services by the languages they serve, and a program that has a line to translate finds a translator the way it finds anything else on the web, by a well-known address rather than a vendor's SDK. It is the languages half of [OpenL10n](/openl10n): OpenL10n keeps what was said in a language, OpenI18n says which languages there are. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface, with a reference implementation in [nixamp](https://nixamp.com).

Status: **0.1**. A description of a document already served, published so any service can serve one and any reader can read it.

Slug: `openi18n`

## The problem

Every service that speaks more than one language says so in its own way: a flag menu, an `Accept-Language` header it may or may not honour, a `?lang=` it invented, a translation API behind a key. A reader cannot ask "do you speak Swedish, and can you make this in it" without reading the docs of each one. And translation itself, now that it runs on a service's own CPU with open models, has no door: each product exposes its own, or none.

The pieces exist. `Accept-Language` and `Content-Language` say what a person wants and what they got. `hreflang` says where the other languages of a page are. ISO 639-1 names the languages. What is missing is the one file that puts them together for a service, so its languages can be discovered instead of guessed, and its translator can be found instead of configured.

## Terms

- A **service** is anything that speaks languages: a site, an API, a player, a keeper of transcripts. Its **descriptor** is the file it serves about them.
- A **language** is an ISO 639-1 code, lowercase: `en`, `de`, `sv`.
- A **pair** is a direction the service can translate: from one language to another.
- A **translator** is the endpoint that turns texts in one language into another.
- A **reader** is anything that reads the descriptor: a person's browser, a directory, a program, an agent.

## The descriptor

A service serves a JSON document at `/.well-known/openi18n.json` on its own origin.

```json
{
  "openi18n": "0.1",
  "name": "nixamp",
  "url": "https://nixamp.com",
  "languages": [
    { "code": "en", "name": "English", "native": "English", "targets": ["de", "sv", "es", "fr"] },
    { "code": "de", "name": "German", "native": "Deutsch", "targets": ["en", "sv", "fr", "es"] },
    { "code": "sv", "name": "Swedish", "native": "Svenska", "targets": ["en", "de"] }
  ],
  "default": "",
  "ask": { "query": "language", "header": "Accept-Language" },
  "translate": {
    "url": "https://nixamp.com/api/v1/translate",
    "auth": { "kind": "bearer", "url": "https://nixamp.com/account" },
    "limits": { "texts": 200, "charactersPerMinute": 20000 },
    "models": { "en-sv": "Xenova/opus-mt-en-sv", "sv-de": "Xenova/opus-mt-sv-en then Xenova/opus-mt-en-de" },
    "pivot": "en"
  },
  "operator": "https://logicsrc.com/.well-known/openprofile.md"
}
```

The smallest valid descriptor is a list of languages:

```json
{ "languages": [{ "code": "en" }, { "code": "sv" }] }
```

The rules, and every one degrades:

1. **`languages` is required and is the only required key.** Each entry has a `code`; `name` is the language in English and `native` in itself, for a picker. A descriptor with codes alone is valid, and a reader names them from its own table.
2. **`targets`** on a language are the languages the service can turn it into. Absent means the service serves content in that language and translates nothing from it. A reader offering a picker for a piece of content in `en` offers exactly `en`'s targets.
3. **`default`** is the language the service answers in when not asked; `""` means as spoken, which is what a transcript or a recording has and a site does not. Absent means the first language listed.
4. **`ask`** says how a reader asks for a language on any resource the service serves: `query` names the parameter (`?language=sv`), `header` names the header, and the query wins when both are given. Absent means `?language=` and `Accept-Language`. A resource answered in a language says so with `Content-Language`, and a resource that exists in several links them with `<link rel="alternate" hreflang="sv">`, as the web already does.
5. **`translate.url`** is the translator. `POST` it `{ "texts": ["…", "…"], "from": "en", "to": "sv" }` and it answers `{ "texts": ["…", "…"], "from": "en", "to": "sv", "model": "…" }`, the same order, empty strings kept in place. A `GET` of the same URL answers this descriptor's `languages`, so a reader that found the translator found the languages. Absent `translate` means the service serves languages and translates nothing.
6. **`translate.auth`** is `none`, `bearer`, `oauth` or `api-key`, with `url` where a person gets a credential, as [OpenMCP](/openmcp) spells it. Absent means unstated, which a reader reports rather than assumes.
7. **`translate.limits`** says how many `texts` one call takes and how many `charactersPerMinute` one caller may send. A translator over its limit answers `429`; a reader waits and asks again. Absent means unstated.
8. **`translate.models`** names what does each pair, by pair (`from-to`), and **`pivot`** names the language a pair with no model of its own goes through. A reader that cares which model touched its words can see it; a pair through a pivot is two models and twice the wait, and the descriptor says so rather than hiding it.
9. **`operator`** is the person or organisation answerable for the service, as an [OpenProfile.md](/openprofile) URL.
10. **Unknown keys are kept.** A service says more than this document names, and a reader passes it through.

Serve it as `application/json`. A descriptor fetched from `/.well-known/` on the service's own origin is verified; one found elsewhere is a claim about the service by whoever hosts it.

## Asking for a language

A reader that wants a resource in a language:

1. Reads the descriptor and checks the language is listed, or is a target of the resource's own language.
2. Asks with `ask.query` (or `?language=`), falling back to `Accept-Language`.
3. Reads `Content-Language` on the answer. A service that could not answer in the language asked for answers in the resource's own language and says so; it never answers a different language silently.
4. When the resource is a transcript, expects `202` with progress while a translation is being made for the first time ([OpenL10n](/openl10n) rule 9), and asks again.

## Translating

A reader with texts to translate:

1. Finds a translator: the descriptor of the service it is already talking to, or a directory listing translators by pair.
2. Checks the pair is in `languages[from].targets`, or that both `from` and `to` reach `pivot`.
3. Sends at most `limits.texts` at a time, keeps under `limits.charactersPerMinute`, and treats `429` as a wait.
4. Keeps what it got. Translation is made once; a reader that has the answer does not ask twice, and a keeper of transcripts keeps it beside the original.

## Directories

A directory reading descriptors lists services by language and by pair, and says for each whether the translator answered when last probed, when, and with which auth. It reports absence as absence: an unstated `translate` is a service that translates nothing, not one that might.

## What is deliberately absent

**No quality score.** `models` says what did the work; whether it did it well is the reader's judgement.

**No locale.** A language is a language. Regions, scripts, date formats and currencies are the web's `lang` attribute and BCP 47's business; a service that needs `pt-BR` says so under its own key.

**No string bundles.** This is not a format for a program's own interface strings. A program that wants its menus in Swedish has gettext and its descendants; this is for the content a service serves and the words it can translate.

## Related standards

- [OpenL10n](/openl10n): the transcript of a file in a language, and its translations.
- [OpenFile](/openfile): the media a transcript belongs to.
- [OpenMCP](/openmcp): the `auth` block, and how a directory probes a service.
- [OpenProfile.md](/openprofile): the `operator` behind a service.

## Version history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-09-13 | First publication: the descriptor, languages and targets, asking for a language, the translator, limits, models and pivot, directories. |

## License

The specification text is CC BY 4.0. Serve it, copy it, extend it.
