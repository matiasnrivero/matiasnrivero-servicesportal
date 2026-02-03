import cron from "node-cron";
import { monthlyBillingService } from "./monthlyBillingService";

class CronScheduler {
  private isInitialized = false;

  initialize(): void {
    if (this.isInitialized) {
      console.log("Cron scheduler already initialized");
      return;
    }

    console.log("Initializing cron scheduler...");

    cron.schedule("0 0 1 * *", async () => {
      console.log("Running monthly billing cron job (1st of month at midnight UTC)");
      try {
        const monthlyResult = await monthlyBillingService.runMonthlyBilling();
        console.log(`Monthly billing completed: ${monthlyResult.successCount} succeeded, ${monthlyResult.failedCount} failed`);

        const packResult = await monthlyBillingService.runPackExceededBilling();
        console.log(`Pack exceeded billing completed: ${packResult.successCount} succeeded, ${packResult.failedCount} failed`);
      } catch (error) {
        console.error("Error running monthly billing cron job:", error);
      }
    }, {
      timezone: "UTC"
    });

    cron.schedule("0 */6 * * *", async () => {
      console.log("Running payment retry cron job (every 6 hours)");
      try {
        const result = await monthlyBillingService.retryFailedBillings();
        console.log(`Payment retry completed: processed ${result.processed}, succeeded ${result.succeeded}, failed ${result.failed}`);
      } catch (error) {
        console.error("Error running payment retry cron job:", error);
      }
    }, {
      timezone: "UTC"
    });

    this.isInitialized = true;
    console.log("Cron scheduler initialized successfully");
  }
}

export const cronScheduler = new CronScheduler();
