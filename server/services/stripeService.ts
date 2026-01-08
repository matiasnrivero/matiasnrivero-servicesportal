import Stripe from "stripe";
import { storage } from "../storage";
import type { ClientProfile, BillingAddress, ServicePack, ClientPackSubscription } from "@shared/schema";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY environment variable is required");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export class StripeService {
  async getOrCreateCustomer(clientProfile: ClientProfile): Promise<string> {
    if (clientProfile.stripeCustomerId) {
      return clientProfile.stripeCustomerId;
    }

    const customer = await stripe.customers.create({
      name: clientProfile.companyName,
      email: clientProfile.email || undefined,
      phone: clientProfile.phone || undefined,
      metadata: {
        clientProfileId: clientProfile.id,
      },
    });

    await storage.updateClientProfile(clientProfile.id, {
      stripeCustomerId: customer.id,
    });

    return customer.id;
  }

  async createSetupIntent(clientProfileId: string): Promise<{ clientSecret: string }> {
    const clientProfile = await storage.getClientProfileById(clientProfileId);
    if (!clientProfile) {
      throw new Error("Client profile not found");
    }

    const customerId = await this.getOrCreateCustomer(clientProfile);

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      metadata: {
        clientProfileId,
      },
    });

    return {
      clientSecret: setupIntent.client_secret!,
    };
  }

  async savePaymentMethod(
    clientProfileId: string,
    stripePaymentMethodId: string,
    billingAddress?: BillingAddress,
    setAsDefault: boolean = true
  ): Promise<void> {
    const clientProfile = await storage.getClientProfileById(clientProfileId);
    if (!clientProfile) {
      throw new Error("Client profile not found");
    }

    const paymentMethod = await stripe.paymentMethods.retrieve(stripePaymentMethodId);
    
    if (!paymentMethod.card) {
      throw new Error("Payment method is not a card");
    }

    const existingMethods = await storage.getClientPaymentMethods(clientProfileId);
    const isFirstCard = existingMethods.length === 0;

    await storage.createClientPaymentMethod({
      clientProfileId,
      stripePaymentMethodId,
      brand: paymentMethod.card.brand,
      last4: paymentMethod.card.last4,
      expMonth: paymentMethod.card.exp_month,
      expYear: paymentMethod.card.exp_year,
      isDefault: setAsDefault || isFirstCard,
      billingAddress: billingAddress || null,
    });

    if (setAsDefault || isFirstCard) {
      const newMethod = (await storage.getClientPaymentMethods(clientProfileId))
        .find(m => m.stripePaymentMethodId === stripePaymentMethodId);
      if (newMethod) {
        await storage.setDefaultPaymentMethod(clientProfileId, newMethod.id);
      }

      const customerId = await this.getOrCreateCustomer(clientProfile);
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: stripePaymentMethodId,
        },
      });
    }
  }

  async removePaymentMethod(paymentMethodId: string): Promise<void> {
    const paymentMethod = await storage.getClientPaymentMethod(paymentMethodId);
    if (!paymentMethod) {
      throw new Error("Payment method not found");
    }

    try {
      await stripe.paymentMethods.detach(paymentMethod.stripePaymentMethodId);
    } catch (error) {
      console.error("Failed to detach payment method from Stripe:", error);
    }

    await storage.deleteClientPaymentMethod(paymentMethodId);
  }

  async chargePaymentMethod(
    clientProfileId: string,
    amountCents: number,
    description: string,
    metadata?: Record<string, string>
  ): Promise<Stripe.PaymentIntent> {
    const clientProfile = await storage.getClientProfileById(clientProfileId);
    if (!clientProfile) {
      throw new Error("Client profile not found");
    }

    const defaultPaymentMethod = await storage.getDefaultPaymentMethod(clientProfileId);
    if (!defaultPaymentMethod) {
      throw new Error("No default payment method found");
    }

    const customerId = await this.getOrCreateCustomer(clientProfile);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      customer: customerId,
      payment_method: defaultPaymentMethod.stripePaymentMethodId,
      off_session: true,
      confirm: true,
      description,
      metadata: {
        clientProfileId,
        ...metadata,
      },
    });

    return paymentIntent;
  }

  async createPaymentIntent(
    clientProfileId: string,
    amountCents: number,
    description: string,
    metadata?: Record<string, string>
  ): Promise<{ clientSecret: string; paymentIntentId: string }> {
    const clientProfile = await storage.getClientProfileById(clientProfileId);
    if (!clientProfile) {
      throw new Error("Client profile not found");
    }

    const customerId = await this.getOrCreateCustomer(clientProfile);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      customer: customerId,
      description,
      metadata: {
        clientProfileId,
        ...metadata,
      },
    });

    return {
      clientSecret: paymentIntent.client_secret!,
      paymentIntentId: paymentIntent.id,
    };
  }

  async refundPayment(
    paymentIntentId: string,
    amountCents?: number,
    reason?: string
  ): Promise<Stripe.Refund> {
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: amountCents,
      reason: "requested_by_customer",
      metadata: {
        reason: reason || "Customer requested refund",
      },
    });

    return refund;
  }

  async getPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    return await stripe.paymentIntents.retrieve(paymentIntentId);
  }

  async verifyWebhookSignature(
    payload: string | Buffer,
    signature: string,
    webhookSecret: string
  ): Promise<Stripe.Event> {
    return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  }

  async listPaymentMethods(customerId: string): Promise<Stripe.PaymentMethod[]> {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
    });
    return paymentMethods.data;
  }

  // ============= Subscription Methods =============

  /**
   * Create or update a Stripe Product and Price for a service pack
   */
  async syncPackToStripe(pack: ServicePack): Promise<{ productId: string; priceId: string }> {
    const priceInCents = Math.round(parseFloat(pack.price || "0") * 100);
    
    let productId = pack.stripeProductId;
    
    // Create or update the product
    if (productId) {
      // Update existing product
      await stripe.products.update(productId, {
        name: pack.name,
        description: pack.description || undefined,
        active: pack.isActive,
        metadata: {
          packId: pack.id,
        },
      });
    } else {
      // Create new product
      const product = await stripe.products.create({
        name: pack.name,
        description: pack.description || undefined,
        active: pack.isActive,
        metadata: {
          packId: pack.id,
        },
      });
      productId = product.id;
    }

    // For prices, we need to create a new one if the price changed
    // (Stripe prices are immutable)
    let priceId = pack.stripePriceId;
    
    if (priceId) {
      // Check if the price matches
      const existingPrice = await stripe.prices.retrieve(priceId);
      if (existingPrice.unit_amount !== priceInCents) {
        // Archive old price and create new one
        await stripe.prices.update(priceId, { active: false });
        priceId = null;
      }
    }
    
    if (!priceId) {
      // Create new price
      const price = await stripe.prices.create({
        product: productId,
        unit_amount: priceInCents,
        currency: "usd",
        recurring: {
          interval: "month",
        },
        metadata: {
          packId: pack.id,
        },
      });
      priceId = price.id;
    }

    // Update the pack with Stripe IDs
    await storage.updateServicePack(pack.id, {
      stripeProductId: productId,
      stripePriceId: priceId,
    });

    return { productId, priceId };
  }

  /**
   * Create a Stripe subscription for a pack with immediate first charge
   * Uses billing_cycle_anchor to set anniversary billing on the current day
   * Returns a subscription ID that should be stored locally for webhook lookups
   */
  async createPackSubscription(
    clientProfileId: string,
    pack: ServicePack,
    localSubscriptionId?: string
  ): Promise<Stripe.Subscription> {
    const clientProfile = await storage.getClientProfileById(clientProfileId);
    if (!clientProfile) {
      throw new Error("Client profile not found");
    }

    // Ensure pack has Stripe price
    let priceId = pack.stripePriceId;
    if (!priceId) {
      const synced = await this.syncPackToStripe(pack);
      priceId = synced.priceId;
    }

    // Get or create customer
    const customerId = await this.getOrCreateCustomer(clientProfile);

    // Get default payment method
    const defaultPaymentMethod = await storage.getDefaultPaymentMethod(clientProfileId);
    if (!defaultPaymentMethod) {
      throw new Error("No payment method on file. Please add a payment method first.");
    }

    // Attach payment method to customer if not already attached
    try {
      await stripe.paymentMethods.attach(defaultPaymentMethod.stripePaymentMethodId, {
        customer: customerId,
      });
    } catch (err: any) {
      // Ignore if already attached - this is expected for returning customers
      if (err.code !== 'resource_already_exists' && !err.message?.includes('already been attached')) {
        throw err;
      }
    }

    // Set as default invoice payment method
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: defaultPaymentMethod.stripePaymentMethodId,
      },
    });

    // Get current day for billing anchor (1-28 for safety)
    const today = new Date();
    const billingAnchorDay = Math.min(today.getDate(), 28);

    // Create subscription with immediate payment
    // payment_behavior: "error_if_incomplete" ensures immediate charge and fails if payment fails
    // collection_method: "charge_automatically" is default but explicit for clarity
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      default_payment_method: defaultPaymentMethod.stripePaymentMethodId,
      payment_behavior: "error_if_incomplete",
      collection_method: "charge_automatically",
      billing_cycle_anchor: Math.floor(Date.now() / 1000),
      proration_behavior: "none",
      metadata: {
        clientProfileId,
        packId: pack.id,
        billingAnchorDay: billingAnchorDay.toString(),
        localSubscriptionId: localSubscriptionId || "",
      },
    });

    return subscription;
  }

  /**
   * Cancel a Stripe subscription at period end
   */
  async cancelSubscription(stripeSubscriptionId: string): Promise<Stripe.Subscription> {
    const subscription = await stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
    return subscription;
  }

  /**
   * Immediately cancel a Stripe subscription
   */
  async cancelSubscriptionImmediately(stripeSubscriptionId: string): Promise<Stripe.Subscription> {
    const subscription = await stripe.subscriptions.cancel(stripeSubscriptionId);
    return subscription;
  }

  /**
   * Resume a subscription that was set to cancel at period end
   */
  async resumeSubscription(stripeSubscriptionId: string): Promise<Stripe.Subscription> {
    const subscription = await stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: false,
    });
    return subscription;
  }

  /**
   * Get a Stripe subscription by ID
   */
  async getSubscription(stripeSubscriptionId: string): Promise<Stripe.Subscription> {
    return await stripe.subscriptions.retrieve(stripeSubscriptionId);
  }

  /**
   * Schedule a subscription update for the next billing cycle
   * Uses Stripe's subscription schedules to change prices at renewal
   */
  async scheduleSubscriptionUpdate(
    stripeSubscriptionId: string,
    newPriceId: string,
    effectiveAt: Date,
    localPeriodEnd?: Date
  ): Promise<Stripe.SubscriptionSchedule> {
    if (!newPriceId) {
      throw new Error("New price ID is required for scheduling subscription update");
    }

    // Get current subscription
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
      expand: ['items.data.price'],
    }) as Stripe.Subscription;
    
    if (subscription.items.data.length === 0) {
      throw new Error("Subscription has no items");
    }

    // Extract current price ID properly (price can be string or object)
    const currentPriceItem = subscription.items.data[0].price;
    const currentPriceId = typeof currentPriceItem === 'string' 
      ? currentPriceItem 
      : currentPriceItem.id;

    // Calculate timestamps - ensure we have valid values
    // Access period dates from the subscription object directly
    let periodStart = (subscription as any).current_period_start as number | undefined;
    let periodEnd = (subscription as any).current_period_end as number | undefined;
    
    // Fall back to local period dates if Stripe doesn't have them
    if (!periodEnd && localPeriodEnd) {
      periodEnd = Math.floor(localPeriodEnd.getTime() / 1000);
      // Set periodStart to 30 days before periodEnd if not available
      periodStart = periodStart || (periodEnd - 30 * 24 * 60 * 60);
    }
    
    console.log("Stripe subscription details:", {
      id: subscription.id,
      status: subscription.status,
      periodStart,
      periodEnd,
      usingLocalFallback: !!(localPeriodEnd && !(subscription as any).current_period_end),
    });
    
    if (!periodStart || !periodEnd) {
      throw new Error(`Subscription has no valid billing period. periodStart=${periodStart}, periodEnd=${periodEnd}`);
    }
    
    const effectiveTimestamp = Math.floor(effectiveAt.getTime() / 1000);
    
    // Use the later of effectiveAt or period end to ensure validity
    // Stripe requires phase transitions to be at or after current period end
    const changeStartDate = Math.max(effectiveTimestamp, periodEnd);

    let schedule: Stripe.SubscriptionSchedule;
    
    if (subscription.schedule) {
      // Already has a schedule - retrieve it first
      const existingScheduleId = typeof subscription.schedule === 'string' 
        ? subscription.schedule 
        : subscription.schedule.id;
      
      const existingSchedule = await stripe.subscriptionSchedules.retrieve(existingScheduleId);
      
      // Get the current phase and add a new phase after it
      const currentPhases = existingSchedule.phases || [];
      if (currentPhases.length === 0) {
        throw new Error("Existing schedule has no phases");
      }
      
      // Keep the current phase as-is, just add/update the future phase
      const firstPhase = currentPhases[0];
      schedule = await stripe.subscriptionSchedules.update(existingScheduleId, {
        phases: [
          {
            items: firstPhase.items.map(item => ({ 
              price: typeof item.price === 'string' ? item.price : item.price?.id || currentPriceId,
              quantity: item.quantity,
            })),
            start_date: firstPhase.start_date,
            end_date: changeStartDate,
          },
          {
            items: [{ price: newPriceId }],
            start_date: changeStartDate,
            proration_behavior: 'none',
          },
        ],
        end_behavior: 'release',
      });
    } else {
      // Create a new schedule from the subscription
      // This automatically creates the first phase from current subscription state
      schedule = await stripe.subscriptionSchedules.create({
        from_subscription: stripeSubscriptionId,
      });
      
      // Retrieve to get the auto-created phase
      const createdSchedule = await stripe.subscriptionSchedules.retrieve(schedule.id);
      const currentPhases = createdSchedule.phases || [];
      
      if (currentPhases.length === 0) {
        throw new Error("Created schedule has no phases");
      }
      
      // Update to add the future phase while preserving the current one
      const firstPhase = currentPhases[0];
      schedule = await stripe.subscriptionSchedules.update(schedule.id, {
        phases: [
          {
            items: firstPhase.items.map(item => ({ 
              price: typeof item.price === 'string' ? item.price : item.price?.id || currentPriceId,
              quantity: item.quantity,
            })),
            start_date: firstPhase.start_date,
            end_date: changeStartDate,
          },
          {
            items: [{ price: newPriceId }],
            start_date: changeStartDate,
            proration_behavior: 'none',
          },
        ],
        end_behavior: 'release',
      });
    }

    return schedule;
  }

  /**
   * Cancel a scheduled subscription update by releasing the schedule
   */
  async cancelScheduledUpdate(stripeSubscriptionId: string): Promise<void> {
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    
    if (!subscription.schedule) {
      return; // No schedule to cancel
    }

    const scheduleId = typeof subscription.schedule === 'string' 
      ? subscription.schedule 
      : subscription.schedule.id;
    
    // Retrieve the schedule to check its status
    const existingSchedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
    
    // Only release if the schedule is active (not already released or canceled)
    if (existingSchedule.status === 'active' || existingSchedule.status === 'not_started') {
      await stripe.subscriptionSchedules.release(scheduleId, {
        preserve_cancel_date: true,
      });
    }
  }

  /**
   * Update subscription to a different pack (upgrade/downgrade)
   * Changes take effect immediately with prorated charges
   */
  async updateSubscriptionPack(
    stripeSubscriptionId: string,
    newPack: ServicePack
  ): Promise<Stripe.Subscription> {
    // Ensure pack has Stripe price
    let priceId = newPack.stripePriceId;
    if (!priceId) {
      const synced = await this.syncPackToStripe(newPack);
      priceId = synced.priceId;
    }

    // Get current subscription
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    
    if (subscription.items.data.length === 0) {
      throw new Error("Subscription has no items");
    }

    // Update subscription item to new price
    const updatedSubscription = await stripe.subscriptions.update(stripeSubscriptionId, {
      items: [{
        id: subscription.items.data[0].id,
        price: priceId,
      }],
      proration_behavior: "create_prorations",
      metadata: {
        ...subscription.metadata,
        packId: newPack.id,
      },
    });

    return updatedSubscription;
  }

  /**
   * Retry payment for a past_due subscription
   */
  async retrySubscriptionPayment(stripeSubscriptionId: string): Promise<Stripe.Invoice | null> {
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    
    if (subscription.latest_invoice) {
      const invoiceId = typeof subscription.latest_invoice === 'string' 
        ? subscription.latest_invoice 
        : subscription.latest_invoice.id;
        
      const invoice = await stripe.invoices.retrieve(invoiceId);
      
      if (invoice.status === 'open') {
        const paidInvoice = await stripe.invoices.pay(invoiceId);
        return paidInvoice;
      }
    }
    
    return null;
  }
}

export const stripeService = new StripeService();
