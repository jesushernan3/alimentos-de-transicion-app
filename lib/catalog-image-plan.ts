import { resolveAssetUrl } from "./resolve-asset-url";

interface CatalogImages {
  recipes: ReadonlyArray<{ thumbUrl?: string | null; imageUrl?: string | null }>;
  collections: ReadonlyArray<{ imageUrl?: string | null }>;
  categories: ReadonlyArray<{ imageUrl?: string | null }>;
}

/** Sólo referencias principales; nunca incluye las fotos secundarias de la galería. */
export function catalogImagePlan({ recipes, collections, categories }: CatalogImages) {
  const unique = (urls: Array<string | null | undefined>) =>
    Array.from(new Set(urls.map(resolveAssetUrl).filter((url): url is string => Boolean(url))));

  // Sin miniatura se conserva el comportamiento de las tarjetas: usar la portada.
  const essential = unique([
    ...recipes.map((recipe) => resolveAssetUrl(recipe.thumbUrl) ?? resolveAssetUrl(recipe.imageUrl)),
    ...collections.map((collection) => collection.imageUrl),
    ...categories.map((category) => category.imageUrl),
  ]);
  const essentialSet = new Set(essential);
  const deferred = unique(recipes.map((recipe) => recipe.imageUrl))
    .filter((url) => !essentialSet.has(url));

  return { essential, deferred, all: [...essential, ...deferred] };
}
