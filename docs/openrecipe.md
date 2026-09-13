# OpenRecipe.md

OpenRecipe.md is one Markdown file that is a recipe: the ingredients, the steps, how many it feeds and how long it takes, in the form a person writes a recipe in and a printer prints it in. Any site can serve one next to the recipe page, any reader (a person, a cooking app, an agent, a grocery list, a directory) can read it without being taught a schema, and the file is the recipe rather than a copy of it. It is maintained by Profullstack, Inc. as part of the LogicSRC open-standards surface.

Status: **0.1**. Written in the same spirit as [OpenResume.md](/docs/openresume) and [OpenProfile.md](/openprofile): Markdown is canonical, every rule degrades, and the structured view is derived.

Slug: `openrecipe`

## The problem

A recipe on the web is four thousand words of memoir with the recipe at the bottom, and a block of JSON-LD in the head that search engines read and people never see. The JSON-LD is the machine copy, the page is the human copy, and they drift: the page says three eggs and the schema says two, because the author edited one and the plugin regenerated the other. A reader that wants the recipe scrolls; an agent that wants it parses the markup and hopes.

The form people actually write recipes in has not changed in a century: a title, a yield, a time, a list of ingredients, a list of steps, a note. That form is Markdown already. What is missing is the agreement on where the file lives and which lines mean what, so a cooking app and a grocery list read the same file the author wrote.

## The shape

```markdown
# Shakshuka

- **Serves**: 4
- **Prep**: 10 min
- **Cook**: 25 min
- **Cuisine**: North African
- **Course**: breakfast, dinner
- **Diet**: vegetarian, gluten-free
- **Author**: Ada Lovelace
- **Source**: https://ada.example/recipes/shakshuka
- **Image**: https://ada.example/recipes/shakshuka.jpg

Eggs poached in a spiced tomato and pepper sauce. One pan, bread on the side.

## Ingredients

- 2 tbsp olive oil
- 1 onion, diced
- 1 red bell pepper, diced
- 3 cloves garlic, minced
- 1 tsp ground cumin
- 1 tsp smoked paprika
- 800 g canned crushed tomatoes
- 6 eggs
- salt
- parsley, chopped (to serve)

## Steps

1. Heat the oil in a wide pan over medium heat. Cook the onion and pepper until soft, about 8 minutes.
2. Add the garlic, cumin and paprika. Cook 1 minute, until fragrant.
3. Pour in the tomatoes, season with salt, and simmer 10 minutes until thickened.
4. Make six wells in the sauce and crack an egg into each. Cover and cook 5 to 8 minutes, until the whites are set and the yolks still soft.
5. Scatter with parsley and serve from the pan.

## Notes

- Feta crumbled over the top before the eggs go in is not traditional and is very good.
- The sauce keeps three days; reheat it and poach the eggs fresh.

## Nutrition

- **Calories**: 260
- **Protein**: 14 g
- **Fat**: 16 g
- **Carbs**: 15 g
```

## The rules

There are eight, and every one of them degrades rather than fails.

**1. One `#` heading, and it is the name of the dish.** More than one and the first wins; none and the reader says the recipe has no name.

**2. The bullet list directly under the name is the summary block.** Each item is `Key: value`, with or without `**bold**` on the key. The keys a reader should understand:

- `Serves` or `Yield`: how much the recipe makes. `4`, `4 to 6`, `12 muffins`, `1 loaf`. A number alone is servings; a number with a word is that many of the thing.
- `Prep`, `Cook`, `Total`: durations as a person writes them, `10 min`, `1 h 30 min`, `overnight`. `Total` absent is `Prep` plus `Cook` when both are stated, and unstated otherwise. A reader that needs ISO 8601 durations derives them (`PT10M`) and never asks the author to write them.
- `Cuisine`, `Course`, `Diet`: comma-separated words, kept as written, matched loosely the way OpenProfile.md matches topics. `vegetarian`, `vegan`, `gluten-free`, `dairy-free`, `halal`, `kosher` are the diet words in common use.
- `Author`: a name, or an [OpenProfile.md](/openprofile) URL. `Source`: where this recipe was first published, which may be the page the file sits beside, and is how an adapted recipe credits the original. `Image`: an image URL.
- `Difficulty`, `Equipment`, `Keywords`: kept as written.

Unknown keys are kept as written, so `Oven`, `Season` and `Wine` all work without anyone having to add them to a list.

**3. A single prose line between the summary block and the first `##` is the description.** One line, the one a directory shows next to the name. More than one, and the rest is kept as prose.

**4. `##` opens a section.** The text is kept verbatim and normalised for matching, so `Ingredients`, `You will need` and `Shopping list` are one thing to a reader. The normalised names are `ingredients`, `steps` (also `method`, `directions`, `instructions`), `notes`, `nutrition`, `equipment` and `variations`. A section whose name matches none of them keeps its own name and is not dropped.

**5. Every bullet under Ingredients is one ingredient, written as a person writes it.** `2 tbsp olive oil`. `1 onion, diced`. `salt`. A reader that wants structure parses a leading quantity and unit when there is one, takes the rest as the ingredient, and keeps a trailing `, diced` or `(to serve)` as the preparation note; when it cannot parse, it keeps the line whole, and the line is still an ingredient. A `###` heading under Ingredients groups them: `### For the sauce`, `### For the dough`. Quantities are in the units the author cooks in; conversion is the reader's job, and doing it at write time destroys the information.

**6. Every numbered item under Steps is one step, in order.** A `###` heading groups steps the same way. A step may carry a time in its text (`about 8 minutes`), and a reader may lift it into a timer, but it stays in the text. A step may embed an image on its own line.

**7. Nutrition is per serving unless the section says otherwise.** `Key: value` with the unit written: `Protein: 14 g`. `Calories` has no unit. A `Per` key (`Per: 100 g`) changes the basis. Absent nutrition is unstated, never computed silently; a reader that estimates says it did.

**8. Source credits the original and Author names the writer.** An adapted recipe names where it came from in `Source` and says what changed in Notes. A reader that shows a recipe shows both.

## Discovery

The file is served, not registered. Three ways, and a reader should try all three.

**1. Next to the page.** A recipe page at `https://ada.example/recipes/shakshuka` serves the file at `https://ada.example/recipes/shakshuka.md` or `.../shakshuka/recipe.md`.

**2. A link element.** The page points at its own file:

```html
<link rel="openrecipe" href="https://ada.example/recipes/shakshuka.md">
```

or as a header, `Link: <...>; rel="openrecipe"`, on responses that are not HTML.

**3. A site index.** A site with many recipes serves `/.well-known/openrecipe.md`: a Markdown list, one recipe per bullet, `[Shakshuka](https://ada.example/recipes/shakshuka.md)`, newest first. A directory reads the index and then each file.

Serve it as `text/markdown; charset=utf-8`.

## schema.org

[schema.org/Recipe](https://schema.org/Recipe) is what search engines read, and a site that serves OpenRecipe.md should keep serving it. The mapping is one to one, and it goes one way:

| OpenRecipe.md | schema.org/Recipe |
|---|---|
| `#` heading | `name` |
| description line | `description` |
| `Serves` / `Yield` | `recipeYield` |
| `Prep`, `Cook`, `Total` | `prepTime`, `cookTime`, `totalTime` as ISO 8601 durations |
| `Cuisine`, `Course`, `Diet` | `recipeCuisine`, `recipeCategory`, `suitableForDiet` |
| `Author`, `Image` | `author`, `image` |
| Ingredients bullets | `recipeIngredient`, one string each, as written |
| Steps items | `recipeInstructions` as `HowToStep`, grouped by `###` into `HowToSection` |
| Nutrition | `nutrition` as `NutritionInformation` |

The JSON-LD is generated from the Markdown on every publish. **The Markdown is the canonical copy.** A site that stores the JSON-LD and renders Markdown from it has the drift this document exists to end.

## What is deliberately absent

**No required fields beyond the name.** A name and a list of ingredients is a valid recipe. So is a name and a list of steps.

**No unit system.** Grams and cups are both kept as written. A reader converts on display and says it did.

**No structured ingredient schema.** `1 onion, diced` is one line, and every cooking app already parses lines like it. A grammar for quantities is a reader's parser, not a writer's burden.

**No ratings, no comments, no story.** The page has those. The file is the recipe.

**No JSON.** A reader may derive a structured view (name, yield, times, ingredient lines with parsed quantities, steps, nutrition) and regenerate it from the Markdown on every read.

## Reading one

A conforming reader:

1. Fetches the file from any of the three discovery locations and parses it under the eight rules.
2. Keeps every line it does not understand.
3. Reports absence as absence: no stated time, no stated nutrition, no stated diet.
4. Matches Cuisine, Course and Diet loosely.
5. Shows `Source` and `Author` whenever it shows the recipe.

## Writing one

By hand, in any editor, in the time it takes to write the recipe. A site with recipes in a database exports one file per recipe from the same rows the page is rendered from, and generates its JSON-LD from the file.

## Related standards

- [OpenProfile.md](/openprofile): the `Author` behind a recipe, and the model for a Markdown file that is the canonical copy.
- [OpenResume.md](/docs/openresume): the same rules for a different document.
- [OpenCoupon](/docs/opencoupon): the same serve-your-own-file idea for a merchant's promotions.

## Version history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-09-13 | First publication: eight rules, the summary block, ingredients and steps as written, three discovery locations, one-way mapping to schema.org/Recipe. |

## License

The specification text is CC BY 4.0. Serve it, copy it, extend it.
