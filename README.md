# Marketplace de pizzas – API TypeScript

API de commande de pizzas pour plusieurs enseignes : catalogue, panier, validation, paiement, suivi et historique.

```bash
npm install
npm run dev        # API sur http://localhost:3000 (commandes et paiements sauvegardés dans data/)
npm run test:run   # tests (stockage en mémoire)
```

## Parcours d'une commande

```
GET  /pizzerias                   menus et prix (US1)
POST /carts                       créer un panier pour une enseigne
POST /carts/:id/items             ajouter une pizza du menu (US1)
POST /carts/:id/custom-items      ajouter une pizza personnalisée (US8)
POST /carts/:id/undo | /redo      annuler / rétablir (US6)
POST /carts/:id/validate          vérifier la commande (US3 + réductions US2)
POST /carts/:id/checkout          valider → payer (US4) → enregistrer (US9)
GET  /clients/:id/orders          historique (US9)
GET  /clients/:id/payments        paiements enregistrés (US4)
```

Autres routes : `GET /pizzerias/:id`, `PATCH|DELETE /carts/:id/items/:itemId`, `POST|GET /promo-codes`, `GET /payment-methods`, `POST /orders/validate`, `POST /pizzas/custom`.

## Design patterns par US

| US | Besoin | Pattern(s) |
|---|---|---|
| 1. Enseignes et pizzas | Chaque enseigne a son menu et ses prix | Factory Method, Strategy |
| 2. Calcul du prix | Réductions interchangeables | Strategy (+ Repository pour les codes promo) |
| 3. Validation de commande | Règles chaînées, arrêt à la 1re erreur | Chain of Responsibility |
| 4. Paiement | 3 moyens aux signatures différentes, interchangeables | Adapter, Strategy, Observer |
| 5. Notifications | Plusieurs réactions à un changement de statut | Observer |
| 6. Annuler les modifications | Sauvegarder et restaurer le panier | Memento |
| 7. Tests | Tester chaque stratégie de prix | – (tests Vitest) |
| 8. Pizza personnalisée | Réutiliser les prix par taille de l'US1 | Adapter |
| 9. Historique | Lire les commandes passées sans dépendre du stockage | Repository, Abstract Factory |

### US1 – Enseignes et pizzas · Factory Method + Strategy

- **Factory Method** : `Pizzeria` (classe abstraite) contient le code commun (menu, prix). Chaque enseigne (`DaMichelePizzeria`, `RossopomodoroPizzeria`, `PizziumPizzeria`) crée son propre menu dans `createMenu()`.
  → *Ajouter une enseigne = ajouter une classe*, sans modifier l'existant.
- **Strategy** : chaque enseigne calcule ses prix différemment. `SizePricingStrategy` a trois implémentations interchangeables :
  - `AdditiveSizePricing` (Da Michele : S −2 €, L +3 €, XL +5 €) ;
  - `MultiplicativeSizePricing` (Rossopomodoro : ×0.8, ×1.3, ×1.5) ;
  - `SingleSizePricing` (Pizzium : taille M uniquement).
- *Pourquoi pas Abstract Factory ?* Une enseigne ne produit pas une famille d'objets liés : seulement des pizzas.

### US2 – Calcul du prix · Strategy

`DiscountStrategy` est implémentée par `HappyHourDiscount` (−20 %), `LoyaltyDiscount` (−10 %) et `PromoCodeDiscount`. La commande applique la première stratégie applicable, par priorité.
→ *Ajouter une réduction = ajouter une classe.*

`PromoCodeDiscount` reçoit un `PromoCodeRepository` par son constructeur : il ne sait pas où les codes sont stockés. Les stratégies sont assemblées à un seul endroit, `default-pricing.ts`.

### US3 – Validation de commande · Chain of Responsibility

Chaque règle est un `ValidationHandler` (panier non vide, minimum 15 €, zone de livraison, enseigne ouverte, stock). Les règles sont chaînées avec `setNext()`. La première règle en échec arrête la chaîne et renvoie son erreur.
→ Chaque règle est isolée, et on peut en ajouter ou en réordonner sans toucher aux autres.

### US4 – Paiement · Adapter + Strategy

- **Adapter** : les trois fournisseurs simulés ont des signatures différentes : `chargeCard(...)`, `submitWalletPayment({...})` et `scheduleCashCollection(...)`. Chaque `*PaymentAdapter` les traduit vers une interface commune, `PaymentMethod`.
- **Strategy** : les moyens de paiement sont interchangeables. `PaymentOrchestrator` tente d'abord le moyen préféré, puis passe au suivant en cas d'indisponibilité technique.
- **Observer** : `PaymentOrchestrator` prévient ses `PaymentListener` à chaque paiement terminé. `PaymentJournalListener` enregistre le paiement, sans que l'orchestrateur sache qu'il est sauvegardé.
- Le cœur ne dépend que de l'interface `PaymentMethod`, jamais des fournisseurs (architecture hexagonale).
- `OrderPlacementService` enchaîne validation → paiement → historique (`POST /carts/:id/checkout`). Il ne connaît que des interfaces (`OrderValidator`, `PaymentPort`, `OrderHistoryRepository`). Une clé d'idempotence empêche de payer deux fois la même commande.

### US5 – Notifications · Observer

`Order` est le sujet observé. Les listeners (`EmailListener`, `SmsListener`) implémentent `OrderStatusListener`, et chacun fait son propre `console.log`. `changeStatus()` prévient tous les listeners abonnés.
- `Order` ne connaît que l'interface : *ajouter un listener ne modifie pas `Order`*.
- `subscribe()` / `unsubscribe()` : un listener s'active ou se désactive à tout moment.

### US6 – Annuler les modifications · Memento

La question du sujet, « sauvegarder l'état d'un objet pour le restaurer plus tard, sans exposer ses détails internes », correspond exactement à l'intention du Memento.

| Rôle | Classe | Responsabilité |
|---|---|---|
| Originator | `Cart` | Avant chaque modification (ajout, suppression, taille), crée un `CartMemento` de son état |
| Memento | `CartMemento` | Copie du contenu du panier, non modifiable de l'extérieur |
| Caretaker | `CartHistory` | Piles undo / redo, 10 états maximum, sans jamais lire leur contenu |

*Pourquoi pas Command ?* Il faudrait écrire l'opération inverse de chaque action. Un snapshot du panier est plus simple et toujours correct.

### US7 – Tests

Un test Vitest par stratégie de prix (standard, Happy Hour, code promo, fidélité), sur une commande type partagée (`test/pricing/order.fixture.ts`).

### US8 – Pizza personnalisée · Adapter

`CustomPizzaService` calcule « base 5 € + ingrédients », puis applique la règle de taille via l'interface `SizePricePolicy`. `PizzeriaCustomPricingAdapter` adapte les enseignes de l'US1 à cette interface.
→ Une pizza personnalisée suit les mêmes règles de taille que le menu, sans dupliquer le calcul.

### US9 – Historique · Repository + Abstract Factory

- **Repository** : `OrderHistoryService` trie (date décroissante) et filtre (statut) les commandes. Il ne dépend que de l'interface `OrderHistoryRepository`, qui a deux implémentations : en mémoire et en fichier JSON.
- **Abstract Factory** : `StorageFactory` crée une *famille* cohérente de repositories (commandes US9 et paiements US4). `InMemoryStorageFactory` sert aux tests, `JsonFileStorageFactory` au serveur (`data/`).
→ Passer à une vraie base de données = ajouter une fabrique, sans modifier `createApp` ni les services.

## Principes transverses

- **Inversion des dépendances (DIP)** : les routeurs et services reçoivent leurs dépendances (`createApp(storage)`, `createCartRouter(pizzerias, orderPlacement)`, `new PromoCodeDiscount(repository)`…). Tout est assemblé dans `src/app.ts`.
- **Ouvert/fermé (OCP)** : enseignes, réductions, règles de validation, moyens de paiement, listeners et types de stockage s'ajoutent en créant une classe, sans modifier le code existant.
