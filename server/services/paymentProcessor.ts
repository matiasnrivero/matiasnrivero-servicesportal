import { storage } from "../storage";
import { stripeService } from "./stripeService";
import type { ServiceRequest, BundleRequest, ClientProfile } from "@shared/schema";

interface PaymentResult {
  success: boolean;
  paymentId?: string;
  message?: string;
  error?: string;
}

export class PaymentProcessor {
  /**
   * Process upfront payment for pay-as-you-go clients at job creation time.
   * Returns payment success/failure so we can set appropriate job status.
   */
  async processUpfrontPayment(
    request: ServiceRequest | BundleRequest,
    requestType: "service_request" | "bundle_request"
  ): Promise<PaymentResult> {
    try {
      const user = await storage.getUser(request.userId);
      if (!user?.clientProfileId) {
        return { success: false, error: "User has no client profile" };
      }

      const clientProfile = await storage.getClientProfileById(user.clientProfileId);
      if (!clientProfile) {
        return { success: false, error: "Client profile not found" };
      }

      // Only pay-as-you-go clients need upfront payment
      const paymentType = clientProfile.paymentConfiguration || "pay_as_you_go";
      if (paymentType !== "pay_as_you_go") {
        return { success: true, message: "No upfront payment required for this payment type" };
      }

      // Check if the job is pack-covered (no payment needed)
      if ("isPackCovered" in request && request.isPackCovered) {
        return { success: true, message: "Service covered by pack subscription" };
      }

      const finalPrice = request.finalPrice;
      if (!finalPrice || parseFloat(finalPrice) <= 0) {
        return { success: true, message: "No payment required (zero or no price)" };
      }

      const amountCents = Math.round(parseFloat(finalPrice) * 100);
      const description = requestType === "service_request" 
        ? `Payment for service request ${request.id}`
        : `Payment for bundle request ${request.id}`;

      // Process pay-as-you-go payment upfront
      return await this.processPayAsYouGoUpfront({
        clientProfile,
        amountCents,
        serviceRequestId: requestType === "service_request" ? request.id : undefined,
        bundleRequestId: requestType === "bundle_request" ? request.id : undefined,
        description,
      });
    } catch (error: any) {
      console.error(`Error processing upfront payment for ${requestType}:`, error);
      return { success: false, error: error.message || "Payment processing failed" };
    }
  }

  /**
   * Process pay-as-you-go payment at job creation (upfront).
   * Returns detailed result so we can update job status accordingly.
   */
  private async processPayAsYouGoUpfront({
    clientProfile,
    amountCents,
    serviceRequestId,
    bundleRequestId,
    description,
  }: {
    clientProfile: ClientProfile;
    amountCents: number;
    serviceRequestId?: string;
    bundleRequestId?: string;
    description: string;
  }): Promise<PaymentResult> {
    try {
      const defaultPaymentMethod = await storage.getDefaultPaymentMethod(clientProfile.id);
      if (!defaultPaymentMethod) {
        // No payment method - record as pending, job goes to payment_failed status
        const payment = await storage.createPayment({
          clientProfileId: clientProfile.id,
          serviceRequestId: serviceRequestId || null,
          bundleRequestId: bundleRequestId || null,
          amountCents,
          status: "pending",
          paymentType: "pay_as_you_go",
        });
        return {
          success: false,
          paymentId: payment.id,
          error: "No payment method on file",
        };
      }

      const paymentIntent = await stripeService.chargePaymentMethod(
        clientProfile.id,
        amountCents,
        description,
        {
          serviceRequestId: serviceRequestId || "",
          bundleRequestId: bundleRequestId || "",
        }
      );

      const payment = await storage.createPayment({
        clientProfileId: clientProfile.id,
        serviceRequestId: serviceRequestId || null,
        bundleRequestId: bundleRequestId || null,
        amountCents,
        status: paymentIntent.status === "succeeded" ? "succeeded" : "pending",
        paymentType: "pay_as_you_go",
        stripePaymentIntentId: paymentIntent.id,
        paidAt: paymentIntent.status === "succeeded" ? new Date() : null,
      });

      // Update the job with payment intent ID
      if (serviceRequestId && paymentIntent.status === "succeeded") {
        await storage.updateServiceRequest(serviceRequestId, {
          stripePaymentIntentId: paymentIntent.id,
          clientPaymentStatus: "paid",
        });
      } else if (bundleRequestId && paymentIntent.status === "succeeded") {
        await storage.updateBundleRequest(bundleRequestId, {
          stripePaymentIntentId: paymentIntent.id,
          clientPaymentStatus: "paid",
        });
      }

      return {
        success: paymentIntent.status === "succeeded",
        paymentId: payment.id,
        message: paymentIntent.status === "succeeded"
          ? "Payment processed successfully"
          : "Payment is being processed",
      };
    } catch (error: any) {
      // Payment failed - record it but job should be marked as payment_failed
      const payment = await storage.createPayment({
        clientProfileId: clientProfile.id,
        serviceRequestId: serviceRequestId || null,
        bundleRequestId: bundleRequestId || null,
        amountCents,
        status: "failed",
        paymentType: "pay_as_you_go",
        failureReason: error.message,
      });

      return {
        success: false,
        paymentId: payment.id,
        error: error.message || "Payment failed",
      };
    }
  }

  /**
   * Retry payment for a job that previously failed payment.
   * Used when client adds a new payment method.
   */
  async retryPaymentForJob(
    requestId: string,
    requestType: "service_request" | "bundle_request"
  ): Promise<PaymentResult> {
    try {
      const request = requestType === "service_request"
        ? await storage.getServiceRequest(requestId)
        : await storage.getBundleRequest(requestId);
      
      if (!request) {
        return { success: false, error: `${requestType} not found` };
      }

      if (request.status !== "payment_failed") {
        return { success: false, error: "Job is not in payment_failed status" };
      }

      const result = await this.processUpfrontPayment(request, requestType);
      
      if (result.success) {
        // Update job status to pending if payment succeeded
        if (requestType === "service_request") {
          await storage.updateServiceRequest(requestId, { status: "pending" });
        } else {
          await storage.updateBundleRequest(requestId, { status: "pending" });
        }
      }

      return result;
    } catch (error: any) {
      console.error(`Error retrying payment for ${requestType}:`, error);
      return { success: false, error: error.message || "Payment retry failed" };
    }
  }

  async processServiceRequestPayment(
    serviceRequest: ServiceRequest,
    deliveredBy: string
  ): Promise<PaymentResult> {
    try {
      const user = await storage.getUser(serviceRequest.userId);
      if (!user?.clientProfileId) {
        return { success: false, error: "User has no client profile" };
      }

      const clientProfile = await storage.getClientProfileById(user.clientProfileId);
      if (!clientProfile) {
        return { success: false, error: "Client profile not found" };
      }

      const finalPrice = serviceRequest.finalPrice;
      if (!finalPrice || parseFloat(finalPrice) <= 0) {
        return { success: true, message: "No payment required (zero or no price)" };
      }

      const amountCents = Math.round(parseFloat(finalPrice) * 100);
      const paymentType = clientProfile.paymentConfiguration || "pay_as_you_go";

      return await this.processPayment({
        clientProfile,
        amountCents,
        paymentType,
        serviceRequestId: serviceRequest.id,
        description: `Payment for service request ${serviceRequest.id}`,
        deliveredBy,
      });
    } catch (error: any) {
      console.error("Error processing service request payment:", error);
      return { success: false, error: error.message || "Payment processing failed" };
    }
  }

  async processBundleRequestPayment(
    bundleRequest: BundleRequest,
    deliveredBy: string
  ): Promise<PaymentResult> {
    try {
      const user = await storage.getUser(bundleRequest.userId);
      if (!user?.clientProfileId) {
        return { success: false, error: "User has no client profile" };
      }

      const clientProfile = await storage.getClientProfileById(user.clientProfileId);
      if (!clientProfile) {
        return { success: false, error: "Client profile not found" };
      }

      const finalPrice = bundleRequest.finalPrice;
      if (!finalPrice || parseFloat(finalPrice) <= 0) {
        return { success: true, message: "No payment required (zero or no price)" };
      }

      const amountCents = Math.round(parseFloat(finalPrice) * 100);
      const paymentType = clientProfile.paymentConfiguration || "pay_as_you_go";

      return await this.processPayment({
        clientProfile,
        amountCents,
        paymentType,
        bundleRequestId: bundleRequest.id,
        description: `Payment for bundle request ${bundleRequest.id}`,
        deliveredBy,
      });
    } catch (error: any) {
      console.error("Error processing bundle request payment:", error);
      return { success: false, error: error.message || "Payment processing failed" };
    }
  }

  private async processPayment({
    clientProfile,
    amountCents,
    paymentType,
    serviceRequestId,
    bundleRequestId,
    description,
    deliveredBy,
  }: {
    clientProfile: ClientProfile;
    amountCents: number;
    paymentType: string;
    serviceRequestId?: string;
    bundleRequestId?: string;
    description: string;
    deliveredBy: string;
  }): Promise<PaymentResult> {
    switch (paymentType) {
      case "pay_as_you_go":
        return await this.processPayAsYouGo({
          clientProfile,
          amountCents,
          serviceRequestId,
          bundleRequestId,
          description,
        });

      case "monthly_payment":
        return await this.recordForMonthlyInvoice({
          clientProfile,
          amountCents,
          serviceRequestId,
          bundleRequestId,
          description,
        });

      case "deduct_from_royalties":
        return await this.recordRoyaltyDeduction({
          clientProfile,
          amountCents,
          serviceRequestId,
          bundleRequestId,
          description,
          markedBy: deliveredBy,
        });

      default:
        return { success: false, error: `Unknown payment type: ${paymentType}` };
    }
  }

  private async processPayAsYouGo({
    clientProfile,
    amountCents,
    serviceRequestId,
    bundleRequestId,
    description,
  }: {
    clientProfile: ClientProfile;
    amountCents: number;
    serviceRequestId?: string;
    bundleRequestId?: string;
    description: string;
  }): Promise<PaymentResult> {
    try {
      const defaultPaymentMethod = await storage.getDefaultPaymentMethod(clientProfile.id);
      if (!defaultPaymentMethod) {
        const payment = await storage.createPayment({
          clientProfileId: clientProfile.id,
          serviceRequestId: serviceRequestId || null,
          bundleRequestId: bundleRequestId || null,
          amountCents,
          status: "pending",
          paymentType: "pay_as_you_go",
        });
        return {
          success: false,
          paymentId: payment.id,
          error: "No payment method on file. Payment recorded as pending.",
        };
      }

      const paymentIntent = await stripeService.chargePaymentMethod(
        clientProfile.id,
        amountCents,
        description,
        {
          serviceRequestId: serviceRequestId || "",
          bundleRequestId: bundleRequestId || "",
        }
      );

      const payment = await storage.createPayment({
        clientProfileId: clientProfile.id,
        serviceRequestId: serviceRequestId || null,
        bundleRequestId: bundleRequestId || null,
        amountCents,
        status: paymentIntent.status === "succeeded" ? "succeeded" : "pending",
        paymentType: "pay_as_you_go",
        stripePaymentIntentId: paymentIntent.id,
        paidAt: paymentIntent.status === "succeeded" ? new Date() : null,
      });

      return {
        success: paymentIntent.status === "succeeded",
        paymentId: payment.id,
        message: paymentIntent.status === "succeeded"
          ? "Payment processed successfully"
          : "Payment is being processed",
      };
    } catch (error: any) {
      const payment = await storage.createPayment({
        clientProfileId: clientProfile.id,
        serviceRequestId: serviceRequestId || null,
        bundleRequestId: bundleRequestId || null,
        amountCents,
        status: "failed",
        paymentType: "pay_as_you_go",
        failureReason: error.message,
      });

      return {
        success: false,
        paymentId: payment.id,
        error: error.message || "Payment failed",
      };
    }
  }

  private async recordForMonthlyInvoice({
    clientProfile,
    amountCents,
    serviceRequestId,
    bundleRequestId,
    description,
  }: {
    clientProfile: ClientProfile;
    amountCents: number;
    serviceRequestId?: string;
    bundleRequestId?: string;
    description: string;
  }): Promise<PaymentResult> {
    const payment = await storage.createPayment({
      clientProfileId: clientProfile.id,
      serviceRequestId: serviceRequestId || null,
      bundleRequestId: bundleRequestId || null,
      amountCents,
      status: "pending",
      paymentType: "monthly_invoice",
      metadata: {
        description,
        invoiceDay: clientProfile.invoiceDay,
        scheduledFor: this.getNextInvoiceDate(clientProfile.invoiceDay || 1),
      } as any,
    });

    return {
      success: true,
      paymentId: payment.id,
      message: "Recorded for monthly invoice",
    };
  }

  private async recordRoyaltyDeduction({
    clientProfile,
    amountCents,
    serviceRequestId,
    bundleRequestId,
    description,
    markedBy,
  }: {
    clientProfile: ClientProfile;
    amountCents: number;
    serviceRequestId?: string;
    bundleRequestId?: string;
    description: string;
    markedBy: string;
  }): Promise<PaymentResult> {
    const payment = await storage.createPayment({
      clientProfileId: clientProfile.id,
      serviceRequestId: serviceRequestId || null,
      bundleRequestId: bundleRequestId || null,
      amountCents,
      status: "succeeded",
      paymentType: "deduct_from_royalties",
      royaltyDeductionNotes: description,
      markedPaidBy: markedBy,
      markedPaidAt: new Date(),
      paidAt: new Date(),
    });

    return {
      success: true,
      paymentId: payment.id,
      message: "Will be deducted from royalties",
    };
  }

  private getNextInvoiceDate(invoiceDay: number): string {
    const now = new Date();
    const currentDay = now.getDate();
    const targetDate = new Date(now);

    if (currentDay >= invoiceDay) {
      targetDate.setMonth(targetDate.getMonth() + 1);
    }
    targetDate.setDate(invoiceDay);

    return targetDate.toISOString().split("T")[0];
  }
}

export const paymentProcessor = new PaymentProcessor();
