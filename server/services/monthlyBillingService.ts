import { storage } from "../storage";
import { stripeService } from "./stripeService";
import type { ClientProfile, ServiceRequest, BundleRequest, MonthlyBillingRecord } from "@shared/schema";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function getCSTMonthYear(date: Date = new Date()): { month: number; year: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: 'numeric'
  });
  const parts = formatter.formatToParts(date);
  const month = parseInt(parts.find(p => p.type === 'month')?.value || '1', 10);
  const year = parseInt(parts.find(p => p.type === 'year')?.value || String(date.getFullYear()), 10);
  return { month, year };
}

function getPreviousCSTMonth(): { month: number; year: number; billingPeriod: string } {
  const now = new Date();
  const { month: currentMonth, year: currentYear } = getCSTMonthYear(now);
  
  let prevMonth = currentMonth - 1;
  let prevYear = currentYear;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear = currentYear - 1;
  }
  
  const billingPeriod = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
  return { month: prevMonth, year: prevYear, billingPeriod };
}

function getCSTMonthBoundaries(month: number, year: number): { startDate: Date; endDate: Date } {
  const startCST = new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00-06:00`);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endCST = new Date(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00-06:00`);
  endCST.setMilliseconds(endCST.getMilliseconds() - 1);
  
  return { startDate: startCST, endDate: endCST };
}

interface BillingJobResult {
  clientProfileId: string;
  companyName: string;
  success: boolean;
  amountCharged?: number;
  error?: string;
  recordId?: string;
}

interface MonthlyBillingServiceResult {
  billingPeriod: string;
  totalClients: number;
  successCount: number;
  failedCount: number;
  results: BillingJobResult[];
}

class MonthlyBillingService {
  private readonly MAX_RETRY_COUNT = 3;
  private readonly RETRY_INTERVAL_HOURS = 24;

  getBillingPeriod(): string {
    const { billingPeriod } = getPreviousCSTMonth();
    return billingPeriod;
  }

  async runMonthlyBilling(): Promise<MonthlyBillingServiceResult> {
    const billingPeriod = this.getBillingPeriod();
    console.log(`Starting monthly billing for period: ${billingPeriod}`);

    const results: BillingJobResult[] = [];

    const allClientProfiles = await storage.getAllClientProfiles();
    const monthlyPaymentClients = allClientProfiles.filter(
      (cp) => cp.paymentConfiguration === "monthly_payment" && !cp.deletedAt
    );

    console.log(`Found ${monthlyPaymentClients.length} Monthly Payment clients to bill`);

    for (const clientProfile of monthlyPaymentClients) {
      const result = await this.processClientBilling(clientProfile, billingPeriod);
      results.push(result);
    }

    const successCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    console.log(`Monthly billing complete: ${successCount} succeeded, ${failedCount} failed`);

    return {
      billingPeriod,
      totalClients: monthlyPaymentClients.length,
      successCount,
      failedCount,
      results,
    };
  }

  async processClientBilling(
    clientProfile: ClientProfile,
    billingPeriod: string
  ): Promise<BillingJobResult> {
    const result: BillingJobResult = {
      clientProfileId: clientProfile.id,
      companyName: clientProfile.companyName,
      success: false,
    };

    try {
      const existingRecord = await storage.getMonthlyBillingRecordByClientAndPeriod(
        clientProfile.id,
        billingPeriod,
        "monthly_services"
      );

      if (existingRecord && existingRecord.status === "completed") {
        console.log(`Billing already completed for ${clientProfile.companyName} for ${billingPeriod}`);
        result.success = true;
        result.recordId = existingRecord.id;
        return result;
      }

      const { serviceRequests, bundleRequests, totalAmount, servicesCount, includedJobIds } =
        await this.gatherDeliveredJobs(clientProfile.id, billingPeriod);

      if (totalAmount === 0) {
        console.log(`No billable amount for ${clientProfile.companyName} for ${billingPeriod}`);
        result.success = true;
        return result;
      }

      let billingRecord: MonthlyBillingRecord;
      if (existingRecord) {
        billingRecord = existingRecord;
      } else {
        billingRecord = await storage.createMonthlyBillingRecord({
          clientProfileId: clientProfile.id,
          billingPeriod,
          recordType: "monthly_services",
          subtotalCents: Math.round(totalAmount * 100),
          processingFeeCents: 0,
          totalCents: Math.round(totalAmount * 100),
          servicesCount,
          includedJobIds,
          status: "pending",
        });
      }

      result.recordId = billingRecord.id;

      const chargeResult = await this.chargeClient(
        clientProfile,
        totalAmount,
        `Monthly Services for ${billingPeriod}`,
        billingRecord.id,
        "monthly_services"
      );

      if (chargeResult.success) {
        await storage.updateMonthlyBillingRecord(billingRecord.id, {
          status: "completed",
          stripePaymentIntentId: chargeResult.paymentIntentId,
          stripeChargeId: chargeResult.chargeId,
          processingFeeCents: chargeResult.processingFeeCents || 0,
          totalCents: Math.round(totalAmount * 100) + (chargeResult.processingFeeCents || 0),
          paidAt: new Date(),
          processedAt: new Date(),
        });

        await storage.updateClientProfile(clientProfile.id, {
          paymentOverdue: false,
          paymentRetryCount: 0,
          lastPaymentRetryAt: null,
          paymentOverdueAt: null,
        });

        result.success = true;
        result.amountCharged = totalAmount;
      } else {
        const newRetryCount = (billingRecord.retryCount || 0) + 1;

        await storage.updateMonthlyBillingRecord(billingRecord.id, {
          status: newRetryCount >= this.MAX_RETRY_COUNT ? "failed" : "pending",
          retryCount: newRetryCount,
          lastRetryAt: new Date(),
          failureReason: chargeResult.error,
        });

        await storage.updateClientProfile(clientProfile.id, {
          paymentRetryCount: newRetryCount,
          lastPaymentRetryAt: new Date(),
          paymentOverdue: newRetryCount >= this.MAX_RETRY_COUNT,
          paymentOverdueAt: newRetryCount >= this.MAX_RETRY_COUNT ? new Date() : clientProfile.paymentOverdueAt,
        });

        result.error = chargeResult.error;

        if (newRetryCount >= this.MAX_RETRY_COUNT) {
          await this.notifyAdminPaymentFailed(clientProfile, billingPeriod, chargeResult.error || "Unknown error", billingRecord.id);
        }
      }
    } catch (error) {
      console.error(`Error processing billing for ${clientProfile.companyName}:`, error);
      result.error = error instanceof Error ? error.message : "Unknown error";
    }

    return result;
  }

  async gatherDeliveredJobs(
    clientProfileId: string,
    billingPeriod: string
  ): Promise<{
    serviceRequests: ServiceRequest[];
    bundleRequests: BundleRequest[];
    totalAmount: number;
    servicesCount: number;
    includedJobIds: { type: "service" | "bundle"; id: string }[];
  }> {
    const [year, month] = billingPeriod.split("-").map(Number);
    const { startDate, endDate } = getCSTMonthBoundaries(month, year);

    const usersWithProfile = await this.getUsersWithClientProfile(clientProfileId);
    const userIds = usersWithProfile.map((u) => u.id);

    const allServiceRequests: ServiceRequest[] = [];
    const allBundleRequests: BundleRequest[] = [];

    for (const userId of userIds) {
      const serviceReqs = await storage.getServiceRequestsByUser(userId);
      const bundleReqs = await storage.getBundleRequestsByUser(userId);
      allServiceRequests.push(...serviceReqs);
      allBundleRequests.push(...bundleReqs);
    }

    const deliveredServiceRequests = allServiceRequests.filter((req) => {
      if (req.status !== "delivered") return false;
      if (!req.deliveredAt) return false;
      const deliveredAt = new Date(req.deliveredAt);
      return deliveredAt >= startDate && deliveredAt <= endDate;
    });

    const deliveredBundleRequests = allBundleRequests.filter((req) => {
      if (req.status !== "delivered") return false;
      if (!req.deliveredAt) return false;
      const deliveredAt = new Date(req.deliveredAt);
      return deliveredAt >= startDate && deliveredAt <= endDate;
    });

    let totalAmount = 0;
    const includedJobIds: { type: "service" | "bundle"; id: string }[] = [];

    for (const req of deliveredServiceRequests) {
      const amount = req.finalPrice ? parseFloat(req.finalPrice) : 0;
      totalAmount += amount;
      includedJobIds.push({ type: "service", id: req.id });
    }

    for (const req of deliveredBundleRequests) {
      const amount = req.finalPrice ? parseFloat(req.finalPrice) : 0;
      totalAmount += amount;
      includedJobIds.push({ type: "bundle", id: req.id });
    }

    return {
      serviceRequests: deliveredServiceRequests,
      bundleRequests: deliveredBundleRequests,
      totalAmount,
      servicesCount: deliveredServiceRequests.length + deliveredBundleRequests.length,
      includedJobIds,
    };
  }

  async getUsersWithClientProfile(clientProfileId: string): Promise<{ id: string }[]> {
    const allUsers = await storage.getAllUsers();
    return allUsers.filter((u) => u.clientProfileId === clientProfileId && u.isActive);
  }

  async chargeClient(
    clientProfile: ClientProfile,
    amount: number,
    description: string,
    billingRecordId: string,
    recordType: "monthly_services" | "pack_exceeded" = "monthly_services"
  ): Promise<{
    success: boolean;
    paymentIntentId?: string;
    chargeId?: string;
    processingFeeCents?: number;
    error?: string;
  }> {
    try {
      const customerId = await stripeService.getOrCreateCustomer(clientProfile);
      const defaultPaymentMethod = await storage.getDefaultPaymentMethod(clientProfile.id);

      if (!defaultPaymentMethod) {
        return { success: false, error: "No payment method on file" };
      }

      const amountCents = Math.round(amount * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: "usd",
        customer: customerId,
        payment_method: defaultPaymentMethod.stripePaymentMethodId,
        confirm: true,
        off_session: true,
        description,
        metadata: {
          clientProfileId: clientProfile.id,
          billingRecordId,
          paymentType: recordType,
        },
      });

      if (paymentIntent.status === "succeeded") {
        let processingFeeCents = 0;
        if (paymentIntent.latest_charge) {
          const chargeId = typeof paymentIntent.latest_charge === "string" 
            ? paymentIntent.latest_charge 
            : paymentIntent.latest_charge.id;
          
          const balanceTransaction = await this.getBalanceTransaction(chargeId);
          if (balanceTransaction) {
            processingFeeCents = balanceTransaction.fee;
          }

          return {
            success: true,
            paymentIntentId: paymentIntent.id,
            chargeId,
            processingFeeCents,
          };
        }

        return {
          success: true,
          paymentIntentId: paymentIntent.id,
        };
      }

      return { success: false, error: `Payment status: ${paymentIntent.status}` };
    } catch (error) {
      console.error("Stripe charge error:", error);
      if (error instanceof Stripe.errors.StripeError) {
        return { success: false, error: error.message };
      }
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  async getBalanceTransaction(chargeId: string): Promise<Stripe.BalanceTransaction | null> {
    try {
      const charge = await stripe.charges.retrieve(chargeId, {
        expand: ["balance_transaction"],
      });
      if (charge.balance_transaction && typeof charge.balance_transaction !== "string") {
        return charge.balance_transaction;
      }
      return null;
    } catch (error) {
      console.error("Error fetching balance transaction:", error);
      return null;
    }
  }

  async notifyAdminPaymentFailed(
    clientProfile: ClientProfile,
    billingPeriod: string,
    error: string,
    billingRecordId?: string
  ): Promise<void> {
    const title = `Payment Failed: ${clientProfile.companyName}`;
    const message = `Billing for ${billingPeriod} failed after ${this.MAX_RETRY_COUNT} attempts. ` +
      `Error: ${error}. Client has been marked as payment overdue and blocked from new service requests.`;
    
    console.error(`PAYMENT FAILED ALERT: ${message}`);

    try {
      await storage.createAdminNotification({
        type: "payment_failed",
        title,
        message,
        clientProfileId: clientProfile.id,
        billingRecordId: billingRecordId || null,
        metadata: {
          companyName: clientProfile.companyName,
          billingPeriod,
          error,
          retryCount: this.MAX_RETRY_COUNT,
        },
      });
    } catch (notificationError) {
      console.error("Failed to create admin notification:", notificationError);
    }
  }

  async retryFailedBillings(): Promise<{ processed: number; succeeded: number; failed: number }> {
    const pendingRecords = await storage.getPendingMonthlyBillingRecords();
    
    const eligibleForRetry = pendingRecords.filter((record) => {
      if (record.retryCount >= this.MAX_RETRY_COUNT) return false;
      if (!record.lastRetryAt) return true;
      
      const lastRetry = new Date(record.lastRetryAt);
      const hoursSinceLastRetry = (Date.now() - lastRetry.getTime()) / (1000 * 60 * 60);
      return hoursSinceLastRetry >= this.RETRY_INTERVAL_HOURS;
    });

    let succeeded = 0;
    let failed = 0;

    for (const record of eligibleForRetry) {
      const clientProfile = await storage.getClientProfileById(record.clientProfileId);
      if (!clientProfile) continue;

      const result = await this.retryBillingRecord(record, clientProfile);
      if (result.success) {
        succeeded++;
      } else {
        failed++;
      }
    }

    return { processed: eligibleForRetry.length, succeeded, failed };
  }

  async retryBillingRecord(
    record: MonthlyBillingRecord,
    clientProfile: ClientProfile
  ): Promise<{ success: boolean; error?: string }> {
    const amount = record.subtotalCents / 100;

    const recordType = record.recordType === "pack_exceeded" ? "pack_exceeded" : "monthly_services";
    const description = record.recordType === "pack_exceeded"
      ? `Pack Exceeded Services for ${record.billingPeriod}`
      : `Monthly Services for ${record.billingPeriod}`;

    const chargeResult = await this.chargeClient(
      clientProfile,
      amount,
      description,
      record.id,
      recordType
    );

    if (chargeResult.success) {
      await storage.updateMonthlyBillingRecord(record.id, {
        status: "completed",
        stripePaymentIntentId: chargeResult.paymentIntentId,
        stripeChargeId: chargeResult.chargeId,
        processingFeeCents: chargeResult.processingFeeCents || 0,
        totalCents: record.subtotalCents + (chargeResult.processingFeeCents || 0),
        paidAt: new Date(),
        processedAt: new Date(),
      });

      await storage.updateClientProfile(clientProfile.id, {
        paymentOverdue: false,
        paymentRetryCount: 0,
        lastPaymentRetryAt: null,
        paymentOverdueAt: null,
      });

      return { success: true };
    }

    const newRetryCount = (record.retryCount || 0) + 1;

    await storage.updateMonthlyBillingRecord(record.id, {
      status: newRetryCount >= this.MAX_RETRY_COUNT ? "failed" : "pending",
      retryCount: newRetryCount,
      lastRetryAt: new Date(),
      failureReason: chargeResult.error,
    });

    await storage.updateClientProfile(clientProfile.id, {
      paymentRetryCount: newRetryCount,
      lastPaymentRetryAt: new Date(),
      paymentOverdue: newRetryCount >= this.MAX_RETRY_COUNT,
      paymentOverdueAt: newRetryCount >= this.MAX_RETRY_COUNT ? new Date() : clientProfile.paymentOverdueAt,
    });

    if (newRetryCount >= this.MAX_RETRY_COUNT) {
      await this.notifyAdminPaymentFailed(
        clientProfile,
        record.billingPeriod,
        chargeResult.error || "Unknown error",
        record.id
      );
    }

    return { success: false, error: chargeResult.error };
  }

  async clearPaymentOverdue(clientProfileId: string): Promise<boolean> {
    try {
      await storage.updateClientProfile(clientProfileId, {
        paymentOverdue: false,
        paymentRetryCount: 0,
        lastPaymentRetryAt: null,
        paymentOverdueAt: null,
      });
      return true;
    } catch (error) {
      console.error("Error clearing payment overdue:", error);
      return false;
    }
  }

  async runPackExceededBilling(): Promise<{
    billingPeriod: string;
    totalClients: number;
    successCount: number;
    failedCount: number;
    results: BillingJobResult[];
  }> {
    const billingPeriod = this.getBillingPeriod();
    console.log(`Starting pack exceeded billing for period: ${billingPeriod}`);

    const results: BillingJobResult[] = [];

    const allClientProfiles = await storage.getAllClientProfiles();
    const payAsYouGoClients = allClientProfiles.filter(
      (cp) => cp.paymentConfiguration === "pay_as_you_go" && !cp.deletedAt
    );

    console.log(`Found ${payAsYouGoClients.length} Pay-as-you-go clients to check for pack exceeded services`);

    for (const clientProfile of payAsYouGoClients) {
      const result = await this.processPackExceededBilling(clientProfile, billingPeriod);
      if (result) {
        results.push(result);
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    console.log(`Pack exceeded billing complete: ${successCount} succeeded, ${failedCount} failed`);

    return {
      billingPeriod,
      totalClients: results.length,
      successCount,
      failedCount,
      results,
    };
  }

  async processPackExceededBilling(
    clientProfile: ClientProfile,
    billingPeriod: string
  ): Promise<BillingJobResult | null> {
    try {
      const existingRecord = await storage.getMonthlyBillingRecordByClientAndPeriod(
        clientProfile.id,
        billingPeriod,
        "pack_exceeded"
      );

      if (existingRecord && existingRecord.status === "completed") {
        console.log(`Pack exceeded billing already completed for ${clientProfile.companyName} for ${billingPeriod}`);
        return {
          clientProfileId: clientProfile.id,
          companyName: clientProfile.companyName,
          success: true,
          recordId: existingRecord.id,
        };
      }

      const { exceededJobs, totalAmount, includedJobIds } =
        await this.gatherPackExceededJobs(clientProfile.id, billingPeriod);

      if (totalAmount === 0 || exceededJobs.length === 0) {
        return null;
      }

      console.log(`Found ${exceededJobs.length} pack exceeded jobs for ${clientProfile.companyName}, total: $${totalAmount.toFixed(2)}`);

      let billingRecord: MonthlyBillingRecord;
      if (existingRecord) {
        billingRecord = existingRecord;
      } else {
        billingRecord = await storage.createMonthlyBillingRecord({
          clientProfileId: clientProfile.id,
          billingPeriod,
          recordType: "pack_exceeded",
          subtotalCents: Math.round(totalAmount * 100),
          processingFeeCents: 0,
          totalCents: Math.round(totalAmount * 100),
          servicesCount: exceededJobs.length,
          includedJobIds,
          status: "pending",
        });
      }

      const chargeResult = await this.chargeClient(
        clientProfile,
        totalAmount,
        `Pack Exceeded Services for ${billingPeriod}`,
        billingRecord.id,
        "pack_exceeded"
      );

      const result: BillingJobResult = {
        clientProfileId: clientProfile.id,
        companyName: clientProfile.companyName,
        success: false,
        recordId: billingRecord.id,
      };

      if (chargeResult.success) {
        await storage.updateMonthlyBillingRecord(billingRecord.id, {
          status: "completed",
          stripePaymentIntentId: chargeResult.paymentIntentId,
          stripeChargeId: chargeResult.chargeId,
          processingFeeCents: chargeResult.processingFeeCents || 0,
          totalCents: Math.round(totalAmount * 100) + (chargeResult.processingFeeCents || 0),
          paidAt: new Date(),
          processedAt: new Date(),
        });

        for (const job of exceededJobs) {
          if (job.type === "service") {
            await storage.updateServiceRequest(job.id, { clientPaymentStatus: "paid" });
          }
        }

        result.success = true;
        result.amountCharged = totalAmount;
      } else {
        const newRetryCount = (billingRecord.retryCount || 0) + 1;

        await storage.updateMonthlyBillingRecord(billingRecord.id, {
          status: newRetryCount >= this.MAX_RETRY_COUNT ? "failed" : "pending",
          retryCount: newRetryCount,
          lastRetryAt: new Date(),
          failureReason: chargeResult.error,
        });

        result.error = chargeResult.error;

        if (newRetryCount >= this.MAX_RETRY_COUNT) {
          await this.notifyAdminPaymentFailed(
            clientProfile,
            `${billingPeriod} Pack Exceeded`,
            chargeResult.error || "Unknown error",
            billingRecord.id
          );
        }
      }

      return result;
    } catch (error) {
      console.error(`Error processing pack exceeded billing for ${clientProfile.companyName}:`, error);
      return {
        clientProfileId: clientProfile.id,
        companyName: clientProfile.companyName,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async gatherPackExceededJobs(
    clientProfileId: string,
    billingPeriod: string
  ): Promise<{
    exceededJobs: { type: "service"; id: string }[];
    totalAmount: number;
    includedJobIds: { type: "service"; id: string }[];
  }> {
    const [year, month] = billingPeriod.split("-").map(Number);
    const { startDate, endDate } = getCSTMonthBoundaries(month, year);

    const usersWithProfile = await this.getUsersWithClientProfile(clientProfileId);
    const userIds = usersWithProfile.map((u) => u.id);

    const allServiceRequests: ServiceRequest[] = [];

    for (const userId of userIds) {
      const serviceReqs = await storage.getServiceRequestsByUser(userId);
      allServiceRequests.push(...serviceReqs);
    }

    const exceededJobs: { type: "service"; id: string }[] = [];
    let totalAmount = 0;

    for (const req of allServiceRequests) {
      if (req.status !== "delivered") continue;
      if (!req.deliveredAt) continue;
      if (!req.isPackOverage) continue;
      if (req.clientPaymentStatus === "paid") continue;

      const deliveredAt = new Date(req.deliveredAt);
      if (deliveredAt < startDate || deliveredAt > endDate) continue;

      const amount = req.finalPrice ? parseFloat(req.finalPrice) : 0;
      totalAmount += amount;
      exceededJobs.push({ type: "service", id: req.id });
    }

    return {
      exceededJobs,
      totalAmount,
      includedJobIds: exceededJobs,
    };
  }

  async runAllMonthlyBilling(): Promise<{
    monthlyPayment: MonthlyBillingServiceResult;
    packExceeded: {
      billingPeriod: string;
      totalClients: number;
      successCount: number;
      failedCount: number;
      results: BillingJobResult[];
    };
  }> {
    console.log("Running all monthly billing (Monthly Payment clients + Pack Exceeded services)");
    
    const monthlyPayment = await this.runMonthlyBilling();
    const packExceeded = await this.runPackExceededBilling();
    
    return { monthlyPayment, packExceeded };
  }
}

export const monthlyBillingService = new MonthlyBillingService();
