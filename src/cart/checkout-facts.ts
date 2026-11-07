
export interface CheckoutFactsQuery {
  readonly restaurantId: string;
  readonly deliveryPostalCode: string;
  readonly items: readonly { readonly name: string }[];
}

export interface CheckoutFacts {
  readonly isDeliveryZoneSupported: boolean;
  readonly isRestaurantOpen: boolean;
  readonly stockByItem: Readonly<Record<string, number>>;
}

export interface CheckoutFactsSource {
  getFacts(query: CheckoutFactsQuery): Promise<CheckoutFacts>;
}

interface OpeningHours {
  readonly openHourUtc: number;
  readonly closeHourUtc: number;
}

interface DemoSettings {
  readonly servedPostalCodesByRestaurant?:
    Readonly<Record<string, readonly string[]>>;

  readonly hoursByRestaurant?:
    Readonly<Record<string, OpeningHours>>;

  readonly stockByRestaurant?:
    Readonly<Record<string, Readonly<Record<string, number>>>>;
}

export class DemoCheckoutFactsSource
  implements CheckoutFactsSource {

  constructor(
    private readonly settings: DemoSettings = {},
    private readonly now: () => Date = () => new Date()
  ) {}

  async getFacts(
    query: CheckoutFactsQuery
  ): Promise<CheckoutFacts> {

    const codes =
      this.settings.servedPostalCodesByRestaurant
        ?.[query.restaurantId] ?? ["75001", "75002"];

    const hours =
      this.settings.hoursByRestaurant
        ?.[query.restaurantId] ?? {
          openHourUtc: 0,
          closeHourUtc: 24
        };

    const hour = this.now().getUTCHours();

    const isRestaurantOpen =
      hours.openHourUtc < hours.closeHourUtc
        ? hour >= hours.openHourUtc &&
          hour < hours.closeHourUtc
        : hours.openHourUtc > hours.closeHourUtc &&
          (hour >= hours.openHourUtc ||
           hour < hours.closeHourUtc);

    const restaurantStock =
      this.settings.stockByRestaurant
        ?.[query.restaurantId];

    const stockByItem: Record<string, number> =
      Object.create(null);

    for (const item of query.items) {
      stockByItem[item.name] =
        restaurantStock &&
        Object.prototype.hasOwnProperty.call(
          restaurantStock,
          item.name
        )
          ? restaurantStock[item.name]
          : 10;
    }

    return {
      isDeliveryZoneSupported:
        codes.includes(query.deliveryPostalCode),

      isRestaurantOpen,

      stockByItem
    };
  }
}
