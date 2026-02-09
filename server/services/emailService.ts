import sgMail from "@sendgrid/mail";

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const SENDER_EMAIL = process.env.SENDGRID_SENDER_EMAIL || "noreply@tri-pod.com";
const SENDER_NAME = process.env.SENDGRID_SENDER_NAME || "Tri-POD Services";
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "support@tri-pod.com";
const PLATFORM_URL = process.env.PLATFORM_URL || "https://tri-pod.com";

export const EMAIL_TEMPLATES = {
  CLIENT_WELCOME: "client_welcome",
  PASSWORD_RESET: "password_reset",
  SERVICE_REQUEST_CLIENT: "service_request_client",
  SERVICE_REQUEST_ADMIN: "service_request_admin",
  JOB_IN_PROGRESS: "job_in_progress",
  JOB_CHANGE_REQUEST_ASSIGNEE: "job_change_request_assignee",
  JOB_CHANGE_REQUEST_VENDOR: "job_change_request_vendor",
  JOB_DELIVERED: "job_delivered",
  JOB_ASSIGNED_VENDOR: "job_assigned_vendor",
  BULK_JOB_ASSIGNED_VENDOR: "bulk_job_assigned_vendor",
  JOB_ASSIGNED_DESIGNER: "job_assigned_designer",
  BULK_JOB_ASSIGNED_DESIGNER: "bulk_job_assigned_designer",
  JOB_CANCELED_ADMIN: "job_canceled_admin",
  JOB_CANCELED_VENDOR: "job_canceled_vendor",
  REFUND_PROCESSED: "refund_processed",
  PACK_ACTIVATED_CLIENT: "pack_activated_client",
  PACK_ACTIVATED_ADMIN: "pack_activated_admin",
  PACK_CANCELED_CLIENT: "pack_canceled_client",
  PACK_CANCELED_ADMIN: "pack_canceled_admin",
  PACK_CANCELED_VENDOR: "pack_canceled_vendor",
  PACK_ASSIGNED_VENDOR: "pack_assigned_vendor",
  PACK_UPGRADED_CLIENT: "pack_upgraded_client",
  PACK_UPGRADED_ADMIN: "pack_upgraded_admin",
  PACK_UPGRADED_VENDOR: "pack_upgraded_vendor",
  PACK_DOWNGRADED_CLIENT: "pack_downgraded_client",
  PACK_DOWNGRADED_ADMIN: "pack_downgraded_admin",
  PACK_DOWNGRADED_VENDOR: "pack_downgraded_vendor",
  PACK_RENEWED: "pack_renewed",
  PACK_USAGE_WARNING: "pack_usage_warning",
  PACK_FULLY_USED: "pack_fully_used",
  INVITE_ADMIN: "invite_admin",
  INVITE_INTERNAL_DESIGNER: "invite_internal_designer",
  INVITE_VENDOR: "invite_vendor",
  INVITE_VENDOR_DESIGNER: "invite_vendor_designer",
  INVITE_CLIENT_ADMIN: "invite_client_admin",
  INVITE_CLIENT_MEMBER: "invite_client_member",
  NEW_SERVICES_COST_INPUT: "new_services_cost_input",
} as const;

function getEmailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; color: #333; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; }
    .header { background-color: #1a2b4a; padding: 24px 32px; text-align: center; }
    .header h1 { color: #ffffff; font-size: 20px; margin: 0; font-weight: 600; }
    .body { padding: 32px; line-height: 1.6; }
    .body h3 { color: #1a2b4a; margin-top: 24px; margin-bottom: 12px; font-size: 16px; }
    .body ul { padding-left: 20px; }
    .body li { margin-bottom: 6px; }
    .body a { color: #2563eb; }
    .cta { display: inline-block; background-color: #2563eb; color: #ffffff !important; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; margin: 16px 0; }
    .footer { background-color: #f8f9fa; padding: 24px 32px; text-align: center; font-size: 13px; color: #666; border-top: 1px solid #eee; }
    .footer a { color: #2563eb; }
    .divider { border: none; border-top: 1px solid #eee; margin: 24px 0; }
  </style>
</head>
<body>
  <div style="padding: 20px; background-color: #f5f5f5;">
    <div class="container">
      <div class="header">
        <h1>Tri-POD Services</h1>
      </div>
      <div class="body">
        ${content}
      </div>
      <div class="footer">
        <p>Tri-POD Services Team</p>
        <p><a href="mailto:{{support_email}}">{{support_email}}</a> | <a href="{{platform_url}}">{{platform_url}}</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

const templates: Record<string, { subject: string; body: string }> = {
  client_welcome: {
    subject: "Welcome to Tri-POD Services Portal \u2014 Your account is ready",
    body: `<p>Hi {{first_name}},</p>
<p>Welcome to Tri-POD Services Portal!</p>
<p>Your account has been successfully created, and you're ready to start requesting services.</p>
<p>The Services Portal is where you can request and manage professional services related to:</p>
<ul>
  <li>Production artwork (vectorization, embroidery digitizing, artwork cleanup, creative art)</li>
  <li>Decoration-ready files for print, embroidery, DTF, sublimation, and more</li>
  <li>E-commerce store setup and visual assets</li>
</ul>
<h3>What you can do now</h3>
<ul>
  <li>Submit new service requests</li>
  <li>Track job status in real time</li>
  <li>Review delivered files and request changes if needed</li>
  <li>Manage your team members and permissions</li>
  <li>Subscribe to service packs for better pricing</li>
</ul>
<h3>Access your account</h3>
<p><a class="cta" href="{{login_url}}">Log in here</a></p>
<p>If your account was created by an administrator, you'll be prompted to set your password the first time you log in.</p>
<p>If you have any questions or need help getting started, our team is here for you.</p>
<p>Welcome aboard \u2014 we're excited to work with you.</p>`,
  },

  password_reset: {
    subject: "Reset your Tri-POD password",
    body: `<p>Hi {{first_name}},</p>
<p>We received a request to reset the password for your Tri-POD account.</p>
<p>To create a new password, click the button below:</p>
<p><a class="cta" href="{{reset_password_url}}">Reset your password</a></p>
<p>This link is valid for a limited time and can only be used once.</p>
<p>If you didn't request a password reset, you can safely ignore this email \u2014 your account will remain secure.</p>
<p>If you need help or continue to have trouble accessing your account, please contact our support team.</p>`,
  },

  service_request_client: {
    subject: "Your service request has been submitted (Job {{job_id}})",
    body: `<p>Hi {{first_name}},</p>
<p>Your service request has been successfully submitted!</p>
<h3>Request details</h3>
<ul>
  <li>Job ID: {{job_id}}</li>
  <li>Service: {{service_name}}</li>
  <li>Submitted on: {{submitted_date}}</li>
</ul>
<p>Our team is reviewing your request and will begin working on it shortly. You'll be notified as soon as the job moves forward.</p>
<p><a class="cta" href="{{job_url}}">View your request</a></p>
<p>If you need to add more information or have questions, you can always access the job from your Services Portal dashboard.</p>`,
  },

  service_request_admin: {
    subject: "New service request submitted \u2014 Job {{job_id}}",
    body: `<p>Hi {{first_name}},</p>
<p>{{client_name}} has submitted a new service request.</p>
<h3>Request details</h3>
<ul>
  <li>Job ID: {{job_id}}</li>
  <li>Service: {{service_name}}</li>
  <li>Submitted by: {{requester_name}}</li>
  <li>Company: {{client_name}}</li>
  <li>Submitted on: {{submitted_date}}</li>
</ul>
<p><a class="cta" href="{{job_url}}">View job details</a></p>
<p>This request is currently pending assignment.</p>`,
  },

  job_in_progress: {
    subject: "Your job is now in progress (Job {{job_id}})",
    body: `<p>Hi {{first_name}},</p>
<p>Good news \u2014 we've started working on your service request!</p>
<h3>Job details</h3>
<ul>
  <li>Job ID: {{job_id}}</li>
  <li>Service: {{service_name}}</li>
  <li>Status: In Progress</li>
</ul>
<p>Our team is actively working on your request. You don't need to take any action right now \u2014 we'll notify you as soon as the job is completed or if we need additional input from you.</p>
<p><a class="cta" href="{{job_url}}">View job details</a></p>
<p>Thanks for trusting Tri-POD Services.</p>`,
  },

  job_change_request_assignee: {
    subject: "Change request received \u2014 Job {{job_id}}",
    body: `<p>Hi {{first_name}},</p>
<p>A change request has been submitted for a job you're assigned to.</p>
<h3>Job details</h3>
<ul>
  <li>Job ID: {{job_id}}</li>
  <li>Service: {{service_name}}</li>
  <li>Requested by: {{requester_name}}</li>
  <li>Company: {{client_name}}</li>
</ul>
<h3>Change request notes</h3>
<p>{{change_request_message}}</p>
<p><a class="cta" href="{{job_url}}">Review and update job</a></p>
<p>Please review the requested changes and continue working on the job accordingly.</p>`,
  },

  job_change_request_vendor: {
    subject: "Change request on a job assigned to your team \u2014 Job {{job_id}}",
    body: `<p>Hi {{first_name}},</p>
<p>A change request has been submitted for a job assigned to one of your team members.</p>
<h3>Job details</h3>
<ul>
  <li>Job ID: {{job_id}}</li>
  <li>Service: {{service_name}}</li>
  <li>Assigned designer: {{assignee_name}}</li>
  <li>Requested by: {{requester_name}}</li>
  <li>Client: {{client_name}}</li>
</ul>
<h3>Change request notes</h3>
<p>{{change_request_message}}</p>
<p><a class="cta" href="{{job_url}}">View job details</a></p>
<p>Please ensure your team reviews the requested changes and continues work on the job accordingly.</p>`,
  },

  job_delivered: {
    subject: "Your job is ready \u2014 Job {{job_id}} delivered",
    body: `<p>Hi {{first_name}},</p>
<p>Your service request is complete!</p>
<p>The final deliverables for your job are now ready.</p>
<h3>Job details</h3>
<ul>
  <li>Job ID: {{job_id}}</li>
  <li>Service: {{service_name}}</li>
  <li>Status: Delivered</li>
</ul>
<p>You can review the delivered files and download everything directly from the Services Portal.</p>
<p><a class="cta" href="{{job_url}}">View and download files</a></p>
<p>If you need any adjustments, you can submit a change request directly from the job page.</p>
<p>Thank you for working with Tri-POD Services.</p>`,
  },

  job_assigned_vendor: {
    subject: "New job assigned to your organization \u2014 Job {{job_id}}",
    body: `<p>Hi {{first_name}},</p>
<p>A new job has been assigned to your organization and is ready to be worked on.</p>
<h3>Job details</h3>
<ul>
  <li>Job ID: {{job_id}}</li>
  <li>Service: {{service_name}}</li>
  <li>Client: {{client_name}}</li>
  <li>Assigned by: {{assigned_by_name}}</li>
</ul>
<p>This job is currently assigned to your organization and has not yet been assigned to a specific designer.</p>
<p><a class="cta" href="{{job_url}}">View job and assign to your team</a></p>
<p>Please assign this job to one of your team members so work can begin.</p>`,
  },

  bulk_job_assigned_vendor: {
    subject: "{{job_count}} new jobs assigned to your organization",
    body: `<p>Hi {{first_name}},</p>
<p>{{job_count}} new jobs have been assigned to your organization and are ready to be worked on.</p>
<h3>Assignment summary</h3>
<ul>
  <li>Number of jobs: {{job_count}}</li>
  <li>Assigned by: {{assigned_by_name}}</li>
  <li>Assignment date: {{assigned_date}}</li>
</ul>
<p>These jobs are currently assigned to your organization and have not yet been assigned to individual designers.</p>
<p><a class="cta" href="{{jobs_list_url}}">View jobs and assign to your team</a></p>
<p>Please review the assigned jobs and distribute them to your team so work can begin.</p>`,
  },

  job_assigned_designer: {
    subject: "A job has been assigned to you \u2014 Job {{job_id}}",
    body: `<p>Hi {{first_name}},</p>
<p>A job has been assigned to you and is ready to be worked on.</p>
<h3>Job details</h3>
<ul>
  <li>Job ID: {{job_id}}</li>
  <li>Service: {{service_name}}</li>
  <li>Client: {{client_name}}</li>
  <li>Assigned by: {{assigned_by_name}}</li>
</ul>
<p><a class="cta" href="{{job_url}}">View job details</a></p>
<p>Please review the job and begin work when ready.</p>`,
  },

  bulk_job_assigned_designer: {
    subject: "{{job_count}} jobs have been assigned to you",
    body: `<p>Hi {{first_name}},</p>
<p>{{job_count}} jobs have been assigned to you and are ready to be worked on.</p>
<h3>Assignment summary</h3>
<ul>
  <li>Number of jobs: {{job_count}}</li>
  <li>Assigned by: {{assigned_by_name}}</li>
  <li>Assignment date: {{assigned_date}}</li>
</ul>
<p><a class="cta" href="{{jobs_list_url}}">View assigned jobs</a></p>
<p>Please review the jobs and begin work when ready.</p>`,
  },

  job_canceled_admin: {
    subject: "Job {{job_id}} has been canceled",
    body: `<p>Hi {{first_name}},</p>
<p>The following job has been canceled.</p>
<h3>Job details</h3>
<ul>
  <li>Job ID: {{job_id}}</li>
  <li>Service: {{service_name}}</li>
  <li>Client: {{client_name}}</li>
  <li>Canceled by: {{canceled_by_name}}</li>
</ul>
<p>This job is no longer active and does not require further action.</p>
<p><a class="cta" href="{{job_url}}">View job details</a></p>`,
  },

  job_canceled_vendor: {
    subject: "Job {{job_id}} has been canceled",
    body: `<p>Hi {{first_name}},</p>
<p>The following job has been canceled.</p>
<h3>Job details</h3>
<ul>
  <li>Job ID: {{job_id}}</li>
  <li>Service: {{service_name}}</li>
  <li>Client: {{client_name}}</li>
  <li>Canceled by: {{canceled_by_name}}</li>
</ul>
<p>This job is no longer active and does not require further action.</p>
<p><a class="cta" href="{{job_url}}">View job details</a></p>`,
  },

  refund_processed: {
    subject: "Your refund has been processed",
    body: `<p>Hi {{first_name}},</p>
<p>We're writing to let you know that your refund has been successfully processed.</p>
<h3>Refund details</h3>
<ul>
  <li>Job ID: {{job_id}}</li>
  <li>Service: {{service_name}}</li>
  <li>Refund amount: {{refund_amount}}</li>
  <li>Payment method: {{payment_method}}</li>
</ul>
<p>The refunded amount will be returned to your original payment method. Depending on your bank or card provider, it may take a few business days for the refund to appear on your statement.</p>
<p><a class="cta" href="{{job_url}}">View job details</a></p>
<p>If you have any questions about this refund or need further assistance, feel free to contact our support team.</p>`,
  },

  pack_activated_client: {
    subject: "Your {{pack_name}} has been activated!",
    body: `<p>Hi {{first_name}},</p>
<p>Your {{pack_name}} subscription is now active!</p>
<p>This pack gives you discounted access to a fixed number of services every month.</p>
<h3>Pack details</h3>
<ul>
  <li>Service: {{service_name}}</li>
  <li>Monthly allowance: {{pack_quantity}} services</li>
  <li>Billing cycle: Monthly</li>
  <li>Renewal date: {{renewal_date}}</li>
</ul>
<h3>How it works</h3>
<ul>
  <li>You can use up to {{pack_quantity}} {{service_name}} jobs during each billing cycle.</li>
  <li>Unused services do not roll over to the next month.</li>
  <li>Your allowance resets automatically on your renewal date.</li>
  <li>You can upgrade or downgrade this pack at any time (changes apply to future billing cycles).</li>
</ul>
<p><a class="cta" href="{{packs_url}}">View your active packs</a></p>
<p>If you have any questions about your subscription or want help choosing the right pack size, our team is happy to help.</p>`,
  },

  pack_activated_admin: {
    subject: "New pack subscription \u2014 {{client_name}} ({{pack_name}})",
    body: `<p>Hi {{first_name}},</p>
<p>{{client_name}} has subscribed to a new service pack.</p>
<h3>Pack details</h3>
<ul>
  <li>Pack: {{pack_name}}</li>
  <li>Service: {{service_name}}</li>
  <li>Monthly allowance: {{pack_quantity}} services</li>
  <li>Renewal date: {{renewal_date}}</li>
</ul>
<p>This subscription represents a recurring monthly service commitment. You may want to review internal capacity or plan vendor allocation accordingly.</p>
<p><a class="cta" href="{{packs_admin_url}}">View client pack details</a></p>`,
  },

  pack_canceled_client: {
    subject: "Your {{pack_name}} subscription has been canceled",
    body: `<p>Hi {{first_name}},</p>
<p>This email confirms that your {{pack_name}} subscription has been canceled.</p>
<h3>Pack details</h3>
<ul>
  <li>Service: {{service_name}}</li>
  <li>Monthly allowance: {{pack_quantity}} services</li>
  <li>Cancelation effective on: {{cancelation_effective_date}}</li>
</ul>
<h3>What this means</h3>
<ul>
  <li>Your pack will remain active until {{cancelation_effective_date}}.</li>
  <li>You can continue using any remaining services in your current billing cycle until that date.</li>
  <li>The subscription will not renew after this period.</li>
</ul>
<p><a class="cta" href="{{packs_url}}">View your active packs</a></p>
<p>If you change your mind, you can subscribe to a new pack at any time from the Services Portal.</p>
<p>If you have any questions or need assistance, feel free to reach out.</p>`,
  },

  pack_canceled_admin: {
    subject: "Pack canceled \u2014 {{client_name}} ({{pack_name}})",
    body: `<p>Hi {{first_name}},</p>
<p>{{client_name}} has canceled a monthly service pack.</p>
<h3>Pack details</h3>
<ul>
  <li>Pack: {{pack_name}}</li>
  <li>Service: {{service_name}}</li>
  <li>Monthly allowance: {{pack_quantity}} services</li>
  <li>Cancelation effective on: {{cancelation_effective_date}}</li>
</ul>
<p>The pack will remain active until the effective date and will not renew after that. You may want to adjust internal capacity planning or vendor allocation accordingly.</p>
<p><a class="cta" href="{{packs_admin_url}}">View client pack details</a></p>`,
  },

  pack_canceled_vendor: {
    subject: "Pack canceled \u2014 {{client_name}} ({{pack_name}})",
    body: `<p>Hi {{first_name}},</p>
<p>This is to inform you that {{client_name}} has canceled a monthly service pack assigned to your organization.</p>
<h3>Pack details</h3>
<ul>
  <li>Pack: {{pack_name}}</li>
  <li>Service: {{service_name}}</li>
  <li>Monthly allowance: {{pack_quantity}} services</li>
  <li>Cancelation effective on: {{cancelation_effective_date}}</li>
</ul>
<p>The pack will remain active until the effective date and will not renew after that.</p>
<p>You may want to adjust team availability or future capacity planning accordingly.</p>
<p><a class="cta" href="{{vendor_packs_url}}">View client pack details</a></p>`,
  },

  pack_assigned_vendor: {
    subject: "New pack assigned to your organization \u2014 {{client_name}} ({{pack_name}})",
    body: `<p>Hi {{first_name}},</p>
<p>A monthly service pack has been assigned to your organization.</p>
<h3>Pack details</h3>
<ul>
  <li>Client: {{client_name}}</li>
  <li>Pack: {{pack_name}}</li>
  <li>Service: {{service_name}}</li>
  <li>Monthly allowance: {{pack_quantity}} services</li>
  <li>Renewal date: {{renewal_date}}</li>
</ul>
<p>This pack represents a recurring monthly workload for the specified service.</p>
<p>You may want to plan team availability and capacity accordingly.</p>
<p><a class="cta" href="{{vendor_packs_url}}">View assigned pack details</a></p>`,
  },

  pack_upgraded_client: {
    subject: "Your pack has been upgraded \u2014 {{new_pack_name}}",
    body: `<p>Hi {{first_name}},</p>
<p>Your monthly service pack has been successfully upgraded!</p>
<h3>What changed</h3>
<ul>
  <li>Previous pack: {{previous_pack_name}}</li>
  <li>{{previous_pack_quantity}} {{service_name}} / month</li>
  <li>New pack: {{new_pack_name}}</li>
  <li>{{new_pack_quantity}} {{service_name}} / month</li>
</ul>
<h3>What this means</h3>
<ul>
  <li>You now have access to more services each month.</li>
  <li>The upgrade applies to future billing cycles.</li>
  <li>Your renewal date remains {{renewal_date}}.</li>
</ul>
<p><a class="cta" href="{{packs_url}}">View your active packs</a></p>
<p>If you need help choosing the right pack size or want to make further changes, we're here to help.</p>`,
  },

  pack_upgraded_admin: {
    subject: "Pack upgraded \u2014 {{client_name}} ({{service_name}})",
    body: `<p>Hi {{first_name}},</p>
<p>{{client_name}} has upgraded a monthly service pack.</p>
<h3>What changed</h3>
<ul>
  <li>Previous pack: {{previous_pack_name}}</li>
  <li>{{previous_pack_quantity}} {{service_name}} / month</li>
  <li>New pack: {{new_pack_name}}</li>
  <li>{{new_pack_quantity}} {{service_name}} / month</li>
</ul>
<h3>Impact</h3>
<p>This upgrade increases the client's monthly service capacity for {{service_name}}.</p>
<p>You may want to adjust internal workload planning or vendor allocation accordingly.</p>
<ul>
  <li>Renewal date: {{renewal_date}}</li>
</ul>
<p><a class="cta" href="{{packs_admin_url}}">View client pack details</a></p>`,
  },

  pack_upgraded_vendor: {
    subject: "Pack upgraded \u2014 {{client_name}} ({{service_name}})",
    body: `<p>Hi {{first_name}},</p>
<p>{{client_name}} has upgraded a monthly service pack assigned to your organization.</p>
<h3>What changed</h3>
<ul>
  <li>Previous pack: {{previous_pack_name}}</li>
  <li>{{previous_pack_quantity}} {{service_name}} / month</li>
  <li>New pack: {{new_pack_name}}</li>
  <li>{{new_pack_quantity}} {{service_name}} / month</li>
</ul>
<h3>Impact</h3>
<p>This upgrade increases the recurring monthly workload for {{service_name}}.</p>
<ul>
  <li>Renewal date: {{renewal_date}}</li>
</ul>
<p>You may want to plan additional team availability or adjust capacity accordingly.</p>
<p><a class="cta" href="{{vendor_packs_url}}">View assigned pack details</a></p>`,
  },

  pack_downgraded_client: {
    subject: "Your pack has been downgraded \u2014 {{new_pack_name}}",
    body: `<p>Hi {{first_name}},</p>
<p>Your monthly service pack has been successfully updated.</p>
<h3>What changed</h3>
<ul>
  <li>Previous pack: {{previous_pack_name}}</li>
  <li>{{previous_pack_quantity}} {{service_name}} / month</li>
  <li>New pack: {{new_pack_name}}</li>
  <li>{{new_pack_quantity}} {{service_name}} / month</li>
</ul>
<h3>What this means</h3>
<ul>
  <li>Your monthly allowance for {{service_name}} will be {{new_pack_quantity}} services.</li>
  <li>The downgrade applies to future billing cycles.</li>
  <li>Your renewal date remains {{renewal_date}}.</li>
</ul>
<p><a class="cta" href="{{packs_url}}">View your active packs</a></p>
<p>You can upgrade or change your pack again at any time if your needs change.</p>`,
  },

  pack_downgraded_admin: {
    subject: "Pack downgraded \u2014 {{client_name}} ({{service_name}})",
    body: `<p>Hi {{first_name}},</p>
<p>{{client_name}} has downgraded a monthly service pack.</p>
<h3>What changed</h3>
<ul>
  <li>Previous pack: {{previous_pack_name}}</li>
  <li>{{previous_pack_quantity}} {{service_name}} / month</li>
  <li>New pack: {{new_pack_name}}</li>
  <li>{{new_pack_quantity}} {{service_name}} / month</li>
</ul>
<h3>Impact</h3>
<p>This change reduces the client's monthly service capacity for {{service_name}}.</p>
<ul>
  <li>Renewal date: {{renewal_date}}</li>
</ul>
<p>You may want to review internal workload planning or adjust vendor allocation accordingly.</p>
<p><a class="cta" href="{{packs_admin_url}}">View client pack details</a></p>`,
  },

  pack_downgraded_vendor: {
    subject: "Pack downgraded \u2014 {{client_name}} ({{service_name}})",
    body: `<p>Hi {{first_name}},</p>
<p>{{client_name}} has downgraded a monthly service pack assigned to your organization.</p>
<h3>What changed</h3>
<ul>
  <li>Previous pack: {{previous_pack_name}}</li>
  <li>{{previous_pack_quantity}} {{service_name}} / month</li>
  <li>New pack: {{new_pack_name}}</li>
  <li>{{new_pack_quantity}} {{service_name}} / month</li>
</ul>
<h3>Impact</h3>
<p>This change reduces the recurring monthly workload for {{service_name}}.</p>
<ul>
  <li>Renewal date: {{renewal_date}}</li>
</ul>
<p>You may want to adjust team availability or future capacity planning accordingly.</p>
<p><a class="cta" href="{{vendor_packs_url}}">View assigned pack details</a></p>`,
  },

  pack_renewed: {
    subject: "Your {{pack_name}} has renewed successfully",
    body: `<p>Hi {{first_name}},</p>
<p>Your {{pack_name}} has renewed successfully, and your monthly allowance has been reset.</p>
<h3>Pack details</h3>
<ul>
  <li>Service: {{service_name}}</li>
  <li>Monthly allowance: {{pack_quantity}} services</li>
  <li>New billing cycle started on: {{renewal_date}}</li>
  <li>Next renewal date: {{next_renewal_date}}</li>
</ul>
<p>You can now use up to {{pack_quantity}} {{service_name}} services during this billing cycle.</p>
<p><a class="cta" href="{{packs_url}}">View your active packs</a></p>
<p>If you need to make any changes to your pack or have questions about your subscription, you can manage everything directly from the Services Portal.</p>`,
  },

  pack_usage_warning: {
    subject: "You've used 80% of your {{pack_name}}",
    body: `<p>Hi {{first_name}},</p>
<p>Just a quick heads-up \u2014 you've used 80% of your {{pack_name}} for this billing cycle.</p>
<h3>Pack usage</h3>
<ul>
  <li>Service: {{service_name}}</li>
  <li>Monthly allowance: {{pack_quantity}} services</li>
  <li>Used so far: {{services_used}}</li>
  <li>Remaining this cycle: {{services_remaining}}</li>
</ul>
<p>Your pack will reset on {{renewal_date}}, and any unused services do not roll over.</p>
<p><a class="cta" href="{{packs_url}}">View pack usage</a></p>
<p>If you expect to need more services before your next renewal, you can upgrade your pack at any time to increase your monthly allowance.</p>`,
  },

  pack_fully_used: {
    subject: "Your {{pack_name}} has been fully used",
    body: `<p>Hi {{first_name}},</p>
<p>You've used 100% of your {{pack_name}} for the current billing cycle.</p>
<h3>Pack usage</h3>
<ul>
  <li>Service: {{service_name}}</li>
  <li>Monthly allowance: {{pack_quantity}} services</li>
  <li>Used: {{pack_quantity}}</li>
  <li>Remaining: 0</li>
</ul>
<h3>What happens next</h3>
<ul>
  <li>You can continue submitting requests for {{service_name}}.</li>
  <li>Any new requests submitted before {{renewal_date}} will be processed at standard ad-hoc pricing.</li>
  <li>Your pack allowance will reset automatically on {{renewal_date}}.</li>
</ul>
<p><a class="cta" href="{{packs_url}}">View pack details</a></p>
<p>If you expect to need more services before your next renewal, you can upgrade your pack at any time to increase your monthly allowance.</p>`,
  },

  invite_admin: {
    subject: "You've been added as an Admin on Tri-POD Services Portal",
    body: `<p>Hi {{first_name}},</p>
<p>You've been added as an Admin on Tri-POD Services Portal by {{created_by_name}}.</p>
<p>As an Admin, you'll have access to platform-level features, including:</p>
<ul>
  <li>Managing users and permissions</li>
  <li>Overseeing service requests and workflows</li>
  <li>Assigning jobs to internal teams and vendors</li>
  <li>Managing service packs and operational settings</li>
</ul>
<h3>Get started</h3>
<p><a class="cta" href="{{login_url}}">Access your account</a></p>
<p>If this is your first time logging in, you'll be prompted to set your password.</p>
<p>If you have any questions about your access or need help getting started, feel free to reach out to the Tri-POD team.</p>`,
  },

  invite_internal_designer: {
    subject: "You've been added as an Internal Designer on Tri-POD Services Portal",
    body: `<p>Hi {{first_name}},</p>
<p>You've been added as an Internal Designer on Tri-POD Services Portal by {{created_by_name}}.</p>
<p>As an Internal Designer, you'll be able to:</p>
<ul>
  <li>View and work on assigned service requests</li>
  <li>Update job statuses and deliver files</li>
  <li>Collaborate with Admins and Vendors on active jobs</li>
  <li>Manage production workflows related to artwork services</li>
</ul>
<h3>Get started</h3>
<p><a class="cta" href="{{login_url}}">Access your account</a></p>
<p>If this is your first time logging in, you'll be prompted to set your password.</p>
<p>If you have any questions about your access or responsibilities, feel free to reach out to your Admin or the Tri-POD team.</p>`,
  },

  invite_vendor: {
    subject: "You've been added as a Vendor on Tri-POD Services Portal",
    body: `<p>Hi {{first_name}},</p>
<p>You've been added as a Vendor on Tri-POD by {{created_by_name}}.</p>
<p>As a Vendor Admin, you'll be responsible for managing your organization's work on the platform, including:</p>
<ul>
  <li>Receiving and managing assigned service requests</li>
  <li>Assigning jobs to your internal designers</li>
  <li>Tracking job status and deliveries</li>
  <li>Managing your vendor team and users</li>
</ul>
<h3>Get started</h3>
<p><a class="cta" href="{{login_url}}">Access your account</a></p>
<p>If this is your first time logging in, you'll be prompted to set your password.</p>
<p>If you have any questions about assignments, workflows, or expectations, please coordinate with the Tri-POD Admin who invited you.</p>`,
  },

  invite_vendor_designer: {
    subject: "You've been added as a Designer on Tri-POD Services Portal",
    body: `<p>Hi {{first_name}},</p>
<p>You've been added as a Vendor Designer on Tri-POD Services Portal by {{created_by_name}}.</p>
<p>As a Vendor Designer, you'll be responsible for working on assigned service requests, including:</p>
<ul>
  <li>Viewing and managing jobs assigned to you</li>
  <li>Preparing and delivering production-ready artwork</li>
  <li>Updating job statuses as work progresses</li>
  <li>Responding to change requests when needed</li>
</ul>
<h3>Get started</h3>
<p><a class="cta" href="{{login_url}}">Access your account</a></p>
<p>If this is your first time logging in, you'll be prompted to set your password.</p>
<p>For questions about assignments, priorities, or deadlines, please coordinate with your Vendor Admin or the Tri-POD team.</p>`,
  },

  invite_client_admin: {
    subject: "You've been added as a Client Admin on Tri-POD Services Portal",
    body: `<p>Hi {{first_name}},</p>
<p>You've been added as a Client Admin on Tri-POD Services Portal by {{created_by_name}}.</p>
<p>As a Client Admin, you'll be able to manage your company's services and team on the platform, including:</p>
<ul>
  <li>Submitting and managing service requests</li>
  <li>Tracking job status and deliveries</li>
  <li>Managing monthly service packs and usage</li>
  <li>Adding and managing team members</li>
  <li>Reviewing billing and subscription details</li>
</ul>
<h3>Get started</h3>
<p><a class="cta" href="{{login_url}}">Access your account</a></p>
<p>If this is your first time logging in, you'll be prompted to set your password.</p>
<p>If you have any questions about your access or need help getting started, feel free to reach out to your Tri-POD contact or our support team.</p>`,
  },

  invite_client_member: {
    subject: "You've been added to your team on Tri-POD Services Portal",
    body: `<p>Hi {{first_name}},</p>
<p>You've been added as a Client Team Member on Tri-POD Services Portal by {{created_by_name}}.</p>
<p>As a Client Team Member, you'll be able to:</p>
<ul>
  <li>Submit service requests on behalf of your company</li>
  <li>View and track the status of active jobs</li>
  <li>Review delivered files and request changes when needed</li>
</ul>
<p>Your access is designed to help you collaborate on projects, while account settings and billing are managed by your Client Admin.</p>
<h3>Get started</h3>
<p><a class="cta" href="{{login_url}}">Access your account</a></p>
<p>If this is your first time logging in, you'll be prompted to set your password.</p>
<p>If you have questions about your role or need additional access, please contact your Client Admin.</p>`,
  },

  new_services_cost_input: {
    subject: "Action required: cost input needed for new services",
    body: `<p>Hi {{first_name}},</p>
<p>New services have been added to the platform and require cost information from your organization.</p>
<p>To ensure accurate pricing and margin calculation, please review the items below and enter your costs.</p>
<h3>Items pending cost input</h3>
<ul>
  <li>Type: {{item_type}}</li>
  <li>Name: {{item_name}}</li>
  <li>(This may include ad-hoc services, bundles, or monthly packs.)</li>
</ul>
<p>Until costs are entered, these items may not be fully available for assignment or profit reporting.</p>
<p><a class="cta" href="{{vendor_costs_url}}">Enter costs now</a></p>
<p>If you have questions about how costs are calculated or what values to enter, please coordinate with the Tri-POD team.</p>`,
  },
};

function replaceVariables(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] !== undefined ? variables[key] : match;
  });
}

export async function sendEmail(
  to: string,
  subject: string,
  htmlContent: string
): Promise<boolean> {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      console.warn("SENDGRID_API_KEY not configured, skipping email send");
      return false;
    }

    await sgMail.send({
      to,
      from: {
        email: SENDER_EMAIL,
        name: SENDER_NAME,
      },
      subject,
      html: htmlContent,
    });

    console.log(`Email sent successfully to ${to}: ${subject}`);
    return true;
  } catch (error: any) {
    console.error(`Failed to send email to ${to}:`, error?.response?.body || error.message);
    return false;
  }
}

export async function sendTemplatedEmail(
  to: string,
  templateId: string,
  variables: Record<string, string>
): Promise<boolean> {
  try {
    const template = templates[templateId];
    if (!template) {
      console.error(`Email template not found: ${templateId}`);
      return false;
    }

    const allVariables: Record<string, string> = {
      support_email: SUPPORT_EMAIL,
      platform_url: PLATFORM_URL,
      ...variables,
    };

    const subject = replaceVariables(template.subject, allVariables);
    const bodyContent = replaceVariables(template.body, allVariables);
    const fullHtml = getEmailWrapper(bodyContent);
    const finalHtml = replaceVariables(fullHtml, allVariables);

    return await sendEmail(to, subject, finalHtml);
  } catch (error: any) {
    console.error(`Failed to send templated email (${templateId}) to ${to}:`, error.message);
    return false;
  }
}
