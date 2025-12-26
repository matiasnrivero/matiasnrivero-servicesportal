export const creativeArtComplexityPricing: Record<string, number> = {
  "Basic": 40,
  "Standard": 60,
  "Advanced": 80,
  "Advance": 80,
  "Ultimate": 100,
};

export const storeCreationPricing = [
  { minProducts: 1, maxProducts: 50, pricePerItem: 2.00 },
  { minProducts: 51, maxProducts: 75, pricePerItem: 1.80 },
  { minProducts: 76, maxProducts: 100, pricePerItem: 1.50 },
  { minProducts: 101, maxProducts: 999999, pricePerItem: 1.10 },
];

export function calculateStoreCreationPrice(productCount: number): number {
  if (!productCount || productCount <= 0) return 0;
  const tier = storeCreationPricing.find(
    (t) => productCount >= t.minProducts && productCount <= t.maxProducts
  );
  return tier ? Number((productCount * tier.pricePerItem).toFixed(2)) : 0;
}

export function calculateCreativeArtPrice(complexity: string): number {
  if (!complexity) return 0;
  return creativeArtComplexityPricing[complexity] || 0;
}

export interface PriceCalculationContext {
  serviceTitle?: string;
  pricingStructure?: string;
  basePrice?: string;
  formData?: Record<string, any> | null;
  finalPrice?: string | null;
}

export function calculateServicePrice(context: PriceCalculationContext): string {
  const { serviceTitle, pricingStructure, basePrice, formData, finalPrice } = context;
  
  if (finalPrice) {
    return `$${parseFloat(finalPrice).toFixed(2)}`;
  }
  
  if (formData?.calculatedPrice) {
    const price = parseFloat(formData.calculatedPrice);
    if (!isNaN(price) && price > 0) {
      if (serviceTitle === "Store Creation") {
        const productCount = formData.amount_of_products || formData.amountOfProducts;
        if (productCount) {
          const recalculated = calculateStoreCreationPrice(parseInt(productCount));
          if (recalculated > 0) {
            return `$${recalculated.toFixed(2)}`;
          }
        }
      }
      return `$${price.toFixed(2)}`;
    }
  }
  
  if (serviceTitle === "Creative Art" || pricingStructure === "complexity") {
    const complexity = formData?.complexity;
    if (complexity) {
      const price = calculateCreativeArtPrice(complexity);
      if (price > 0) {
        return `$${price.toFixed(2)}`;
      }
    }
  }
  
  if (serviceTitle === "Store Creation" || pricingStructure === "quantity") {
    const productCount = formData?.amount_of_products || formData?.amountOfProducts;
    if (productCount) {
      const price = calculateStoreCreationPrice(parseInt(productCount));
      if (price > 0) {
        return `$${price.toFixed(2)}`;
      }
    }
  }
  
  if (basePrice) {
    return `$${parseFloat(basePrice).toFixed(2)}`;
  }
  
  return "N/A";
}
