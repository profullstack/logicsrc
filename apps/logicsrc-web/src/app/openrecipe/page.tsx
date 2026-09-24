import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { specMetadata } from "@/lib/page-meta";
import { SiteShell } from "@/components/site-shell";
import { mono, pre, table, td, th } from "../openontology/ui";

export const metadata: Metadata = specMetadata(
  "/openrecipe",
  "OpenRecipe.md is one Markdown file that is a recipe: a summary block (Serves, Prep, Cook, Cuisine, Diet, Author, Source), ingredients and steps as written, notes and nutrition, served next to the recipe page or linked with rel=\"openrecipe\". schema.org/Recipe JSON-LD is derived from it, never the reverse."
);

const EXAMPLE = `# Shakshuka

- **Serves**: 4
- **Prep**: 10 min
- **Cook**: 25 min
- **Cuisine**: North African
- **Diet**: vegetarian, gluten-free
- **Author**: Ada Lovelace
- **Source**: https://ada.example/recipes/shakshuka

Eggs poached in a spiced tomato and pepper sauce. One pan, bread on the side.

## Ingredients

- 2 tbsp olive oil
- 1 onion, diced
- 800 g canned crushed tomatoes
- 6 eggs
- parsley, chopped (to serve)

## Steps

1. Heat the oil in a wide pan. Cook the onion until soft, about 8 minutes.
2. Pour in the tomatoes, season, and simmer 10 minutes until thickened.
3. Make six wells, crack an egg into each, cover, cook 5 to 8 minutes.

## Nutrition

- **Calories**: 260
- **Protein**: 14 g`;

const RULES: Array<[string, string]> = [
  ["One # heading", "The name of the dish. More than one and the first wins."],
  ["The summary block", "Serves or Yield, Prep, Cook, Total, Cuisine, Course, Diet, Author, Source, Image are understood; unknown keys are kept."],
  ["The description", "One prose line between the block and the first ##."],
  ["## opens a section", "ingredients, steps (method, directions, instructions), notes, nutrition, equipment, variations. Unknown sections are kept."],
  ["Ingredients as written", "One bullet per ingredient: 1 onion, diced. A reader parses a leading quantity when it can and keeps the line whole when it cannot. ### groups them."],
  ["Steps in order", "One numbered item per step. A time in the text may become a timer but stays in the text."],
  ["Nutrition per serving", "Key: value with the unit written; Per changes the basis. Never computed silently."],
  ["Source and Author", "An adapted recipe names where it came from and says what changed in Notes."]
];

const MAPPING: Array<[string, string]> = [
  ["# heading", "name"],
  ["Serves / Yield", "recipeYield"],
  ["Prep, Cook, Total", "prepTime, cookTime, totalTime as ISO 8601 durations"],
  ["Cuisine, Course, Diet", "recipeCuisine, recipeCategory, suitableForDiet"],
  ["Ingredients bullets", "recipeIngredient, one string each, as written"],
  ["Steps items", "recipeInstructions as HowToStep, ### groups as HowToSection"],
  ["Nutrition", "nutrition as NutritionInformation"]
];

const ABSENT: Array<[string, string]> = [
  ["No required fields beyond the name", "A name and a list of ingredients is a valid recipe. So is a name and a list of steps."],
  ["No unit system", "Grams and cups are both kept as written. A reader converts on display and says it did."],
  ["No ingredient grammar", "1 onion, diced is one line, and every cooking app already parses lines like it."],
  ["No ratings, no story", "The page has those. The file is the recipe."],
  ["No JSON", "The structured view is derived and regenerated from the Markdown on every read."]
];

export default function OpenRecipePage(): ReactNode {
  return (
    <SiteShell active="OpenRecipe.md">
      <div className="band">
        <div className="section-head">
          <p className="eyebrow">LogicSRC standards surface</p>
          <h2>OpenRecipe.md</h2>
          <p>
            One Markdown file that is a recipe, in the form a person writes one and a printer prints
            one. The page has the story. The file has the recipe.
          </p>
        </div>
        <p style={{ color: "#41505d" }}>
          A recipe on the web is four thousand words of memoir with the recipe at the bottom, and a
          block of JSON-LD in the head that search engines read and people never see. The two
          drift: the page says three eggs and the schema says two. The form people actually write
          recipes in has not changed in a century and it is Markdown already. OpenRecipe.md fixes
          where the file lives and which lines mean what, so a cooking app, a grocery list and an
          agent read the file the author wrote.
        </p>
        <p style={{ color: "#5b6b7a" }}>
          Status: 0.1. Same rules as <Link href="/openprofile">OpenProfile.md</Link> and{" "}
          <Link href="/docs/openresume">OpenResume.md</Link>: Markdown is canonical, every rule
          degrades, the structured view is derived.
        </p>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The shape</h2>
        </div>
        <pre style={pre}>{EXAMPLE}</pre>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>The eight rules</h2>
          <p>Every one of them degrades rather than fails.</p>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Rule</th>
              <th style={th}>What it means</th>
            </tr>
          </thead>
          <tbody>
            {RULES.map(([rule, meaning], index) => (
              <tr key={rule}>
                <td style={td}>
                  <strong>
                    {index + 1}. {rule}
                  </strong>
                </td>
                <td style={td}>{meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Discovery</h2>
          <p>
            Next to the page (<code style={mono}>/recipes/shakshuka.md</code>), a{" "}
            <code style={mono}>{'<link rel="openrecipe">'}</code> on the page, or a site index at{" "}
            <code style={mono}>/.well-known/openrecipe.md</code>, one recipe per bullet. Served as{" "}
            <code style={mono}>text/markdown</code>.
          </p>
        </div>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>schema.org, one way</h2>
          <p>
            Keep serving schema.org/Recipe for search engines. Generate it from the Markdown on
            every publish. The Markdown is the canonical copy.
          </p>
        </div>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>OpenRecipe.md</th>
              <th style={th}>schema.org/Recipe</th>
            </tr>
          </thead>
          <tbody>
            {MAPPING.map(([md, schema]) => (
              <tr key={md}>
                <td style={td}>{md}</td>
                <td style={td}>
                  <code style={mono}>{schema}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>What is deliberately absent</h2>
        </div>
        <table style={table}>
          <tbody>
            {ABSENT.map(([what, why]) => (
              <tr key={what}>
                <td style={td}>
                  <strong>{what}</strong>
                </td>
                <td style={td}>{why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="band">
        <div className="section-head">
          <h2>Where everything lives</h2>
        </div>
        <ul style={{ color: "#41505d", lineHeight: 1.9, paddingLeft: "1.1rem" }}>
          <li>
            <Link href="/docs/openrecipe">Specification</Link>: the shape, eight rules, discovery,
            the schema.org mapping
          </li>
          <li>
            <Link href="/openprofile">OpenProfile.md</Link>, the Author behind a recipe;{" "}
            <Link href="/opencoupon">OpenCoupon</Link>, the same serve-your-own-file idea for a
            merchant&apos;s promotions
          </li>
        </ul>
      </div>
    </SiteShell>
  );
}
