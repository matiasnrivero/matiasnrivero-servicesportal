import { storage } from "../storage";
import { sendTemplatedEmail, EMAIL_TEMPLATES } from "./emailService";

export interface NotificationRecipient {
  userId: string;
  email: string;
  firstName: string;
}

async function notifyAndEmail(
  recipients: NotificationRecipient[],
  templateId: string,
  variables: Record<string, string>,
  notification: {
    type: string;
    title: string;
    message: string;
    link?: string;
  }
) {
  const emailPromises = recipients.map(r =>
    sendTemplatedEmail(r.email, templateId, { ...variables, first_name: r.firstName })
  );

  const notificationData = recipients.map(r => ({
    userId: r.userId,
    type: notification.type,
    title: notification.title,
    message: replaceVariables(notification.message, variables),
    link: notification.link ? replaceVariables(notification.link, variables) : undefined,
    isRead: false,
  }));

  await Promise.allSettled([
    ...emailPromises,
    notificationData.length > 0 ? storage.createNotifications(notificationData) : Promise.resolve(),
  ]);
}

async function emailOnly(
  recipients: NotificationRecipient[],
  templateId: string,
  variables: Record<string, string>,
) {
  await Promise.allSettled(
    recipients.map(r =>
      sendTemplatedEmail(r.email, templateId, { ...variables, first_name: r.firstName })
    )
  );
}

function replaceVariables(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || `{{${key}}}`);
}

export const notificationService = {
  async onServiceRequestSubmitted(
    submitter: NotificationRecipient,
    vars: { job_id: string; service_name: string; submitted_date: string; job_url: string }
  ) {
    await notifyAndEmail(
      [submitter],
      EMAIL_TEMPLATES.SERVICE_REQUEST_CLIENT,
      vars,
      {
        type: "service_request_submitted",
        title: "Service request submitted",
        message: "Job {{job_id}} was submitted successfully.\nService: {{service_name}}",
        link: vars.job_url,
      }
    );
  },

  async onServiceRequestSubmittedAdmin(
    admins: NotificationRecipient[],
    vars: { job_id: string; service_name: string; requester_name: string; client_name: string; submitted_date: string; job_url: string }
  ) {
    await notifyAndEmail(
      admins,
      EMAIL_TEMPLATES.SERVICE_REQUEST_ADMIN,
      vars,
      {
        type: "service_request_admin",
        title: "New service request",
        message: "{{client_name}} submitted Job {{job_id}}\nService: {{service_name}}",
        link: vars.job_url,
      }
    );
  },

  async onJobInProgress(
    submitter: NotificationRecipient,
    vars: { job_id: string; service_name: string; job_url: string }
  ) {
    await notifyAndEmail(
      [submitter],
      EMAIL_TEMPLATES.JOB_IN_PROGRESS,
      vars,
      {
        type: "job_in_progress",
        title: "Job in progress",
        message: "Job {{job_id}} is now being worked on.\nService: {{service_name}}",
        link: vars.job_url,
      }
    );
  },

  async onJobChangeRequestAssignee(
    assignees: NotificationRecipient[],
    vars: { job_id: string; service_name: string; requester_name: string; client_name: string; change_request_message: string; job_url: string }
  ) {
    await notifyAndEmail(
      assignees,
      EMAIL_TEMPLATES.JOB_CHANGE_REQUEST_ASSIGNEE,
      vars,
      {
        type: "job_change_request",
        title: "Change request received",
        message: "{{client_name}} requested changes on Job {{job_id}}\nClick to review updates",
        link: vars.job_url,
      }
    );
  },

  async onJobChangeRequestVendor(
    vendors: NotificationRecipient[],
    vars: { job_id: string; service_name: string; assignee_name: string; requester_name: string; client_name: string; change_request_message: string; job_url: string }
  ) {
    await notifyAndEmail(
      vendors,
      EMAIL_TEMPLATES.JOB_CHANGE_REQUEST_VENDOR,
      vars,
      {
        type: "job_change_request_vendor",
        title: "Change request for your team",
        message: "{{client_name}} requested changes on Job {{job_id}}\nAssigned to: {{assignee_name}}",
        link: vars.job_url,
      }
    );
  },

  async onJobDelivered(
    submitter: NotificationRecipient,
    vars: { job_id: string; service_name: string; job_url: string }
  ) {
    await notifyAndEmail(
      [submitter],
      EMAIL_TEMPLATES.JOB_DELIVERED,
      vars,
      {
        type: "job_delivered",
        title: "Job delivered",
        message: "Job {{job_id}} is ready to review.\nClick to view the deliverables",
        link: vars.job_url,
      }
    );
  },

  async onJobAssignedVendor(
    vendor: NotificationRecipient,
    vars: { job_id: string; service_name: string; client_name: string; assigned_by_name: string; job_url: string }
  ) {
    await notifyAndEmail(
      [vendor],
      EMAIL_TEMPLATES.JOB_ASSIGNED_VENDOR,
      vars,
      {
        type: "job_assigned_vendor",
        title: "New job assigned to your organization",
        message: "Job {{job_id}} is ready to be assigned to your team.\nService: {{service_name}}",
        link: vars.job_url,
      }
    );
  },

  async onBulkJobAssignedVendor(
    vendor: NotificationRecipient,
    vars: { job_count: string; assigned_by_name: string; assigned_date: string; jobs_list_url: string }
  ) {
    await notifyAndEmail(
      [vendor],
      EMAIL_TEMPLATES.BULK_JOB_ASSIGNED_VENDOR,
      vars,
      {
        type: "bulk_job_assigned_vendor",
        title: "Multiple jobs assigned to your organization",
        message: "{{job_count}} new jobs are ready to be assigned to your team.\nClick to view job list",
        link: vars.jobs_list_url,
      }
    );
  },

  async onJobAssignedDesigner(
    assignee: NotificationRecipient,
    vars: { job_id: string; service_name: string; client_name: string; assigned_by_name: string; job_url: string }
  ) {
    await notifyAndEmail(
      [assignee],
      EMAIL_TEMPLATES.JOB_ASSIGNED_DESIGNER,
      vars,
      {
        type: "job_assigned_designer",
        title: "Job assigned to you",
        message: "Job {{job_id}} is now assigned to you.\nService: {{service_name}}",
        link: vars.job_url,
      }
    );
  },

  async onBulkJobAssignedDesigner(
    assignee: NotificationRecipient,
    vars: { job_count: string; assigned_by_name: string; assigned_date: string; jobs_list_url: string }
  ) {
    await notifyAndEmail(
      [assignee],
      EMAIL_TEMPLATES.BULK_JOB_ASSIGNED_DESIGNER,
      vars,
      {
        type: "bulk_job_assigned_designer",
        title: "Multiple jobs assigned to you",
        message: "{{job_count}} new jobs are ready to be worked on.\nClick to view job list",
        link: vars.jobs_list_url,
      }
    );
  },

  async onJobCanceledAdmin(
    admins: NotificationRecipient[],
    vars: { job_id: string; service_name: string; client_name: string; canceled_by_name: string; job_url: string }
  ) {
    await notifyAndEmail(
      admins,
      EMAIL_TEMPLATES.JOB_CANCELED_ADMIN,
      vars,
      {
        type: "job_canceled",
        title: "Job canceled",
        message: "Job {{job_id}} was canceled by {{canceled_by_name}}\nNo further action required",
        link: vars.job_url,
      }
    );
  },

  async onJobCanceledVendor(
    vendors: NotificationRecipient[],
    vars: { job_id: string; service_name: string; client_name: string; canceled_by_name: string; job_url: string }
  ) {
    await notifyAndEmail(
      vendors,
      EMAIL_TEMPLATES.JOB_CANCELED_VENDOR,
      vars,
      {
        type: "job_canceled_vendor",
        title: "Job canceled",
        message: "Job {{job_id}} was canceled by {{canceled_by_name}}\nNo further action required",
        link: vars.job_url,
      }
    );
  },

  async onRefundProcessed(
    client: NotificationRecipient,
    vars: { job_id: string; service_name: string; refund_amount: string; payment_method: string; job_url: string }
  ) {
    await notifyAndEmail(
      [client],
      EMAIL_TEMPLATES.REFUND_PROCESSED,
      vars,
      {
        type: "refund_processed",
        title: "Refund processed",
        message: "A refund of {{refund_amount}} has been issued for Job {{job_id}}.\nIt may take a few days to appear on your statement",
        link: vars.job_url,
      }
    );
  },

  async onPackActivatedClient(
    client: NotificationRecipient,
    vars: { pack_name: string; service_name: string; pack_quantity: string; renewal_date: string; packs_url: string }
  ) {
    await notifyAndEmail(
      [client],
      EMAIL_TEMPLATES.PACK_ACTIVATED_CLIENT,
      vars,
      {
        type: "pack_activated",
        title: "Pack activated",
        message: "Your {{pack_name}} is now active.\n{{pack_quantity}} services available this month",
        link: vars.packs_url,
      }
    );
  },

  async onPackActivatedAdmin(
    admins: NotificationRecipient[],
    vars: { pack_name: string; service_name: string; pack_quantity: string; renewal_date: string; client_name: string; packs_admin_url: string }
  ) {
    await notifyAndEmail(
      admins,
      EMAIL_TEMPLATES.PACK_ACTIVATED_ADMIN,
      vars,
      {
        type: "pack_activated_admin",
        title: "New pack subscription",
        message: "{{client_name}} activated {{pack_name}}\n{{pack_quantity}} {{service_name}} / month",
        link: vars.packs_admin_url,
      }
    );
  },

  async onPackCanceledClient(
    client: NotificationRecipient,
    vars: { pack_name: string; service_name: string; pack_quantity: string; cancelation_effective_date: string; packs_url: string }
  ) {
    await notifyAndEmail(
      [client],
      EMAIL_TEMPLATES.PACK_CANCELED_CLIENT,
      vars,
      {
        type: "pack_canceled",
        title: "Pack canceled",
        message: "Your {{pack_name}} will remain active until {{cancelation_effective_date}}.\nThe subscription will not renew",
        link: vars.packs_url,
      }
    );
  },

  async onPackCanceledAdmin(
    admins: NotificationRecipient[],
    vars: { pack_name: string; service_name: string; pack_quantity: string; cancelation_effective_date: string; client_name: string; packs_admin_url: string }
  ) {
    await notifyAndEmail(
      admins,
      EMAIL_TEMPLATES.PACK_CANCELED_ADMIN,
      vars,
      {
        type: "pack_canceled_admin",
        title: "Pack canceled",
        message: "{{client_name}} canceled {{pack_name}}\nActive until {{cancelation_effective_date}}",
        link: vars.packs_admin_url,
      }
    );
  },

  async onPackCanceledVendor(
    vendors: NotificationRecipient[],
    vars: { pack_name: string; service_name: string; pack_quantity: string; cancelation_effective_date: string; client_name: string; vendor_packs_url: string }
  ) {
    await notifyAndEmail(
      vendors,
      EMAIL_TEMPLATES.PACK_CANCELED_VENDOR,
      vars,
      {
        type: "pack_canceled_vendor",
        title: "Pack canceled",
        message: "{{client_name}} canceled {{pack_name}}\nActive until {{cancelation_effective_date}}",
        link: vars.vendor_packs_url,
      }
    );
  },

  async onPackAssignedVendor(
    vendor: NotificationRecipient,
    vars: { pack_name: string; service_name: string; pack_quantity: string; renewal_date: string; client_name: string; vendor_packs_url: string }
  ) {
    await notifyAndEmail(
      [vendor],
      EMAIL_TEMPLATES.PACK_ASSIGNED_VENDOR,
      vars,
      {
        type: "pack_assigned_vendor",
        title: "New pack assigned",
        message: "{{client_name}} assigned {{pack_name}} to your organization\n{{pack_quantity}} {{service_name}} / month",
        link: vars.vendor_packs_url,
      }
    );
  },

  async onPackUpgradedClient(
    client: NotificationRecipient,
    vars: { previous_pack_name: string; previous_pack_quantity: string; new_pack_name: string; new_pack_quantity: string; service_name: string; renewal_date: string; packs_url: string }
  ) {
    await notifyAndEmail(
      [client],
      EMAIL_TEMPLATES.PACK_UPGRADED_CLIENT,
      vars,
      {
        type: "pack_upgraded",
        title: "Pack upgraded",
        message: "{{previous_pack_quantity}} \u2192 {{new_pack_quantity}} {{service_name}} / month\n{{new_pack_name}} is now active",
        link: vars.packs_url,
      }
    );
  },

  async onPackUpgradedAdmin(
    admins: NotificationRecipient[],
    vars: { previous_pack_name: string; previous_pack_quantity: string; new_pack_name: string; new_pack_quantity: string; service_name: string; renewal_date: string; client_name: string; packs_admin_url: string }
  ) {
    await notifyAndEmail(
      admins,
      EMAIL_TEMPLATES.PACK_UPGRADED_ADMIN,
      vars,
      {
        type: "pack_upgraded_admin",
        title: "Pack upgraded",
        message: "{{client_name}} increased {{service_name}} capacity\n{{previous_pack_quantity}} \u2192 {{new_pack_quantity}} / month",
        link: vars.packs_admin_url,
      }
    );
  },

  async onPackUpgradedVendor(
    vendors: NotificationRecipient[],
    vars: { previous_pack_name: string; previous_pack_quantity: string; new_pack_name: string; new_pack_quantity: string; service_name: string; renewal_date: string; client_name: string; vendor_packs_url: string }
  ) {
    await notifyAndEmail(
      vendors,
      EMAIL_TEMPLATES.PACK_UPGRADED_VENDOR,
      vars,
      {
        type: "pack_upgraded_vendor",
        title: "Pack upgraded",
        message: "{{client_name}} increased {{service_name}} capacity\n{{previous_pack_quantity}} \u2192 {{new_pack_quantity}} / month",
        link: vars.vendor_packs_url,
      }
    );
  },

  async onPackDowngradedClient(
    client: NotificationRecipient,
    vars: { previous_pack_name: string; previous_pack_quantity: string; new_pack_name: string; new_pack_quantity: string; service_name: string; renewal_date: string; packs_url: string }
  ) {
    await notifyAndEmail(
      [client],
      EMAIL_TEMPLATES.PACK_DOWNGRADED_CLIENT,
      vars,
      {
        type: "pack_downgraded",
        title: "Pack downgraded",
        message: "{{previous_pack_quantity}} \u2192 {{new_pack_quantity}} {{service_name}} / month\n{{new_pack_name}} will apply next cycle",
        link: vars.packs_url,
      }
    );
  },

  async onPackDowngradedAdmin(
    admins: NotificationRecipient[],
    vars: { previous_pack_name: string; previous_pack_quantity: string; new_pack_name: string; new_pack_quantity: string; service_name: string; renewal_date: string; client_name: string; packs_admin_url: string }
  ) {
    await notifyAndEmail(
      admins,
      EMAIL_TEMPLATES.PACK_DOWNGRADED_ADMIN,
      vars,
      {
        type: "pack_downgraded_admin",
        title: "Pack downgraded",
        message: "{{client_name}} reduced {{service_name}} capacity\n{{previous_pack_quantity}} \u2192 {{new_pack_quantity}} / month",
        link: vars.packs_admin_url,
      }
    );
  },

  async onPackDowngradedVendor(
    vendors: NotificationRecipient[],
    vars: { previous_pack_name: string; previous_pack_quantity: string; new_pack_name: string; new_pack_quantity: string; service_name: string; renewal_date: string; client_name: string; vendor_packs_url: string }
  ) {
    await notifyAndEmail(
      vendors,
      EMAIL_TEMPLATES.PACK_DOWNGRADED_VENDOR,
      vars,
      {
        type: "pack_downgraded_vendor",
        title: "Pack downgraded",
        message: "{{client_name}} reduced {{service_name}} capacity\n{{previous_pack_quantity}} \u2192 {{new_pack_quantity}} / month",
        link: vars.vendor_packs_url,
      }
    );
  },

  async onPackRenewed(
    client: NotificationRecipient,
    vars: { pack_name: string; service_name: string; pack_quantity: string; renewal_date: string; next_renewal_date: string; packs_url: string }
  ) {
    await notifyAndEmail(
      [client],
      EMAIL_TEMPLATES.PACK_RENEWED,
      vars,
      {
        type: "pack_renewed",
        title: "Pack renewed",
        message: "Your {{pack_name}} has renewed and your monthly allowance is reset.\n{{pack_quantity}} {{service_name}} available this cycle",
        link: vars.packs_url,
      }
    );
  },

  async onPackUsageWarning(
    client: NotificationRecipient,
    vars: { pack_name: string; service_name: string; pack_quantity: string; services_used: string; services_remaining: string; renewal_date: string; packs_url: string }
  ) {
    await notifyAndEmail(
      [client],
      EMAIL_TEMPLATES.PACK_USAGE_WARNING,
      vars,
      {
        type: "pack_usage_warning",
        title: "Pack usage alert",
        message: "You've used 80% of your {{pack_name}}\n{{services_remaining}} services remaining this cycle",
        link: vars.packs_url,
      }
    );
  },

  async onPackFullyUsed(
    client: NotificationRecipient,
    vars: { pack_name: string; service_name: string; pack_quantity: string; renewal_date: string; packs_url: string }
  ) {
    await notifyAndEmail(
      [client],
      EMAIL_TEMPLATES.PACK_FULLY_USED,
      vars,
      {
        type: "pack_fully_used",
        title: "Pack fully used",
        message: "New requests will use ad-hoc pricing until {{renewal_date}}\nUpgrade your pack to add more services",
        link: vars.packs_url,
      }
    );
  },

  async onClientWelcome(
    client: NotificationRecipient,
    vars: { login_url: string }
  ) {
    await emailOnly([client], EMAIL_TEMPLATES.CLIENT_WELCOME, vars);
  },

  async onPasswordReset(
    user: NotificationRecipient,
    vars: { reset_password_url: string }
  ) {
    await emailOnly([user], EMAIL_TEMPLATES.PASSWORD_RESET, vars);
  },

  async onAdminInvite(
    newAdmin: NotificationRecipient,
    vars: { created_by_name: string; login_url: string }
  ) {
    await emailOnly([newAdmin], EMAIL_TEMPLATES.INVITE_ADMIN, vars);
  },

  async onInternalDesignerInvite(
    newDesigner: NotificationRecipient,
    vars: { created_by_name: string; login_url: string }
  ) {
    await emailOnly([newDesigner], EMAIL_TEMPLATES.INVITE_INTERNAL_DESIGNER, vars);
  },

  async onVendorInvite(
    newVendor: NotificationRecipient,
    vars: { created_by_name: string; login_url: string }
  ) {
    await emailOnly([newVendor], EMAIL_TEMPLATES.INVITE_VENDOR, vars);
  },

  async onVendorDesignerInvite(
    newDesigner: NotificationRecipient,
    vars: { created_by_name: string; login_url: string }
  ) {
    await emailOnly([newDesigner], EMAIL_TEMPLATES.INVITE_VENDOR_DESIGNER, vars);
  },

  async onClientAdminInvite(
    newClient: NotificationRecipient,
    vars: { created_by_name: string; login_url: string }
  ) {
    await emailOnly([newClient], EMAIL_TEMPLATES.INVITE_CLIENT_ADMIN, vars);
  },

  async onClientMemberInvite(
    newMember: NotificationRecipient,
    vars: { created_by_name: string; login_url: string }
  ) {
    await emailOnly([newMember], EMAIL_TEMPLATES.INVITE_CLIENT_MEMBER, vars);
  },

  async onNewServicesCostInput(
    vendors: NotificationRecipient[],
    vars: { item_type: string; item_name: string; vendor_costs_url: string }
  ) {
    await notifyAndEmail(
      vendors,
      EMAIL_TEMPLATES.NEW_SERVICES_COST_INPUT,
      vars,
      {
        type: "new_services_cost_input",
        title: "Cost input required",
        message: "New services need cost information from your organization",
        link: vars.vendor_costs_url,
      }
    );
  },
};
