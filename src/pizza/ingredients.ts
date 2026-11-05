
export const AVAILABLE_INGREDIENTS = [
  { id: "mozzarella", name: "Mozzarella", price: 1.5 },
  { id: "pepperoni", name: "Pepperoni", price: 2 },
  { id: "champignons", name: "Champignons", price: 1 },
  { id: "jambon", name: "Jambon", price: 2 },
  { id: "olives", name: "Olives", price: 1 },
  { id: "gorgonzola", name: "Gorgonzola", price: 2.5 },
] as const;

export type IngredientId =
  (typeof AVAILABLE_INGREDIENTS)[number]["id"];

export function findIngredient(id: string) {
  return AVAILABLE_INGREDIENTS.find(
    ingredient => ingredient.id === id
  );
}
