import {
  getCollection,
  type CollectionEntry,
  type AnyEntryMap,
  type ContentEntryMap,
} from "astro:content";
import { defaultLocale } from "@i18n/const";
import { removeLocalePrefix, startsWithSupportedLocale } from "@i18n/utils";
import type { ReferenceDocContentItem } from "../content/types";
import { load } from "cheerio";
import he from "he";

interface EntryWithId {
  id: string;
}

/**
 * Retreives all the entries in the given collection, filtered to only include
 * those in the default locale (language).
 *
 * @param collectionName
 * @returns
 */
export const getCollectionInDefaultLocale = async <C extends keyof AnyEntryMap>(
  collectionName: C,
): Promise<CollectionEntry<C>[]> =>
  await getCollection(collectionName, (entry: unknown) => {
    const { id } = entry as EntryWithId;
    return id.startsWith(`${defaultLocale}/`);
  });

/**
 * Retreives all the entries in the given collection for a given locale, and
 * includes entries in the default locale for entries that aren't localized
 *
 * @param collectionName
 * @param locale
 * @returns
 */
export const getCollectionInLocaleWithFallbacks = async <
  C extends keyof AnyEntryMap,
>(
  collectionName: C,
  locale: string,
): Promise<CollectionEntry<C>[]> => {
  const localizedEntries = await getCollectionInLocale(collectionName, locale);
  const defaultLocaleCollection =
    await getCollectionInDefaultLocale(collectionName);
  const filteredDefaultEntries = defaultLocaleCollection.filter(
    (defaultEntry) => {
      const { id: defaultLocaleId } = defaultEntry as EntryWithId;
      return !localizedEntries.some((localeEntry: unknown) => {
        const { id: localeId } = localeEntry as EntryWithId;
        return (
          removeLocalePrefix(localeId) === removeLocalePrefix(defaultLocaleId)
        );
      });
    },
  );
  // Merge the locale entries with the filtered default entries
  return [...localizedEntries, ...filteredDefaultEntries];
};

/**
 * Retrieves all the entries in the given collection, filtered to only include
 * those in *non-default* locales (languages).
 *
 * @param collectionName
 * @returns
 */
export const getCollectionInNonDefaultLocales = async <
  C extends keyof AnyEntryMap,
>(
  collectionName: C,
): Promise<CollectionEntry<C>[]> =>
  await getCollection(collectionName, (entry: unknown) => {
    const { id } = entry as EntryWithId;
    return startsWithSupportedLocale(id);
  });

/**
 * Retrieves all the entries in the given collection, filtered to only include
 * those in a the given *non-default* locale (language).
 *
 * @param collectionName
 * @param locale
 * @returns
 */
export const getCollectionInLocale = async <C extends keyof AnyEntryMap>(
  collectionName: C,
  locale: string,
): Promise<CollectionEntry<C>[]> =>
  await getCollection(collectionName, (entry: unknown) => {
    const { id } = entry as EntryWithId;
    return id.startsWith(`${locale}/`);
  });

/**
 * Astro automatically uses the directory structure for slug information
 * Historically the p5 website has used a different structure for example file vs. webpage routing
 * This function transforms the Astro slug to the appropriate webpage route to avoid breaking
 * Any inbound legacy links
 */
export const exampleContentSlugToLegacyWebsiteSlug = (slug: string): string =>
  slug
    // First transformation: Remove any locale prefix.
    .replace(/^[\w-]+?\//, "") // Remove locale prefix
    // Second transformation: Convert slugs built from local dev path to the legacy format.
    // For example, "123_topicA/456_topicB/description" becomes "topicA-topicB.html".
    .replace(/\d+_(.*?)\/\d+_(.*?)\/description$/, "$1-$2")
    // Third transformation: Replace all remaining underscores in the slug with hyphens.
    .replace(/_/g, "-");

/**
 * If the given slug is the slug of the entry in the contributor doc
 * collection that we want to use as the index page, this returns a
 * '/' slug for routing purposes. Otherwise, just returns the slug given,
 * unchanged.
 *
 * For example: `contributor-docs/es/` will show
 * the content from `contributor-docs/es/readme`
 */
export const convertContributorDocIndexSlugIfNeeded = (slug: string) => {
  const contributorDocIndexPageName = "readme";
  return slug.endsWith(contributorDocIndexPageName)
    ? `/${slug.slice(0, -contributorDocIndexPageName.length)}`
    : slug;
};

export const normalizeReferenceRoute = (route: string): string =>
  removeLocaleAndExtension(route).replace("constants/", "");

export const removeLocaleAndExtension = (id: string): string =>
  removeContentFileExt(removeLeadingSlash(removeLocalePrefix(id)));

export const removeLeadingSlash = (path: string): string =>
  path.replace(/^\//, "");
/**
 * We cannot use Astro's default slug because it removes characters like '.'
 * We use the id instead and remove the file extension
 */
export const removeContentFileExt = (id: string): string =>
  id.replace(/\.(mdx?|ya?ml)$/, "");

/* We have to modify the Astro.js slug to match existing routing */
/* This is done dynamically here instead of relying on example authors */
/* to update their slugs in the MDX Content Entry */
export const transformExampleSlugs = <C extends keyof ContentEntryMap>(
  exampleCollection: CollectionEntry<C>[],
): CollectionEntry<C>[] => {
  const transformedEntries = exampleCollection.map((entry) => ({
    ...entry,
    slug: exampleContentSlugToLegacyWebsiteSlug(entry.slug),
  }));

  return transformedEntries;
};

/**
 * Returns the correct URL to link to for a library entry
 * @param library
 * @returns
 */
export const getLibraryLink = (library: CollectionEntry<"libraries">) =>
  library.data.websiteUrl ?? library.data.sourceUrl;

/**
 * Some reference examples have multiple examples in one string separated by <div></div>
 * This function separates the examples into individual strings
 * @param examples Reference example strings from MDX
 * @returns The examples separated into individual strings
 */
export const separateReferenceExamples = (examples: string[]): string[] =>
  examples
    ?.flatMap((example: string) => example.split("</div>"))
    .map((htmlFrag: string) => htmlFrag.replace(/<\/?div>|<\/?code>/g, ""))
    .filter((cleanExample: string) => cleanExample);

/**
 * Returns the title concatenated with parentheses if the reference entry is a constructor or method
 * This could be handled in the reference parsing and authoring process instead
 * @param referenceEntry Reference entry
 * @returns The title concatenated with parentheses if the reference entry is a constructor or method
 */
export const getRefEntryTitleConcatWithParen = (
  referenceEntry: ReferenceDocContentItem,
) =>
  `${referenceEntry.data.title}${referenceEntry.data.isConstructor || referenceEntry.data.itemtype === "method" ? "()" : ""}`;

/* Function to escape HTML content within <code> tags
 * @param htmlString String with HTML content
 * @returns String with HTML content where the content inside <code> tags is escaped
 */
export const escapeCodeTagsContent = (htmlString: string): string => {
  // Load the HTML string into Cheerio
  const $ = load(htmlString);
  // Loop through all <code> tags
  $("code").each(function () {
    // Get the current text and HTML inside the <code> tag
    const currentHtml = $(this).html() ?? "";
    // Use he to escape HTML entities
    const escapedHtml = he.escape(currentHtml);
    // Update the <code> tag content with the escaped HTML
    $(this).html(escapedHtml);
  });
  // Return the modified HTML as a string
  return $.html();
};
