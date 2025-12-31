import Stripe from "stripe";
import { storage } from "../storage";
import type { ClientProfile, BillingAddress } from "@shared/schema";

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
}

export const stripeService = new StripeService();
