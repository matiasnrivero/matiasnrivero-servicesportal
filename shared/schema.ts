import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, decimal, integer, jsonb, boolean, unique } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// User roles hierarchy: admin > internal_designer > vendor > vendor_designer > client > client_member
export const userRoles = ["admin", "internal_designer", "vendor", "vendor_designer", "client", "client_member"] as const;
export type UserRole = typeof userRoles[number];

// Vendor payment statuses for jobs
export const vendorPaymentStatuses = ["pending", "paid"] as const;
export type VendorPaymentStatus = typeof vendorPaymentStatuses[number];

// Client payment methods
export const paymentMethods = ["pay_as_you_go", "monthly_payment", "deduct_from_royalties"] as const;
export type PaymentMethod = typeof paymentMethods[number];

// Pricing structure types for services
export const pricingStructures = ["single", "complexity", "quantity"] as const;
export type PricingStructure = typeof pricingStructures[number];

// Service hierarchy types - father services are standalone, son services add-on to fathers
export const serviceHierarchyTypes = ["father", "son"] as const;
export type ServiceHierarchy = typeof serviceHierarchyTypes[number];

// Input field usage context - request fields are client-facing, delivery fields are for internal users
export const inputForTypes = ["request", "delivery"] as const;
export type InputForType = typeof inputForTypes[number];

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email"),
  phone: text("phone"),
  role: text("role").notNull().default("client"),
  isActive: boolean("is_active").notNull().default(true),
  // Internal vendor flag - cannot be deactivated, always shows at top of vendor lists
  isInternal: boolean("is_internal").notNull().default(false),
  // Vendor relationship - links vendor_designer to their parent vendor
  vendorId: varchar("vendor_id"),
  // Client company relationship - links client users to their company profile
  clientProfileId: varchar("client_profile_id"),
  // Client company entity - links users to their organizational company for shared pack subscriptions
  clientCompanyId: varchar("client_company_id"),
  // Client payment configuration
  paymentMethod: text("payment_method"),
  invitedBy: varchar("invited_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at"),
});

// Vendor profiles with pricing agreements and SLAs
export const vendorProfiles = pgTable("vendor_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  companyName: text("company_name").notNull(),
  website: text("website"),
  email: text("email"),
  phone: text("phone"),
  // Pricing agreements per service type (JSON structure)
  pricingAgreements: jsonb("pricing_agreements"),
  // SLA configuration (JSON: { serviceType: { days: number, hours: number } })
  slaConfig: jsonb("sla_config"),
  // Holidays/OOO days (JSON: [{ date: string, title: string }])
  holidays: jsonb("holidays"),
  // Working hours configuration (JSON: { timezone: string, startHour: string, endHour: string })
  workingHours: jsonb("working_hours"),
  // Soft delete timestamp - when set, vendor is considered deleted
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Client payment configuration types
export const clientPaymentConfigurations = ["pay_as_you_go", "monthly_payment", "deduct_from_royalties"] as const;
export type ClientPaymentConfiguration = typeof clientPaymentConfigurations[number];

// Tri-POD product discount tiers
export const tripodDiscountTiers = ["none", "power_level", "oms_subscription", "enterprise"] as const;
export type TripodDiscountTier = typeof tripodDiscountTiers[number];

// Discount percentages for each tier
export const tripodDiscountPercentages: Record<TripodDiscountTier, number> = {
  none: 0,
  power_level: 10,
  oms_subscription: 15,
  enterprise: 20,
};

// Client profiles with company info - links client users to their company
export const clientProfiles = pgTable("client_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Primary user is the first client who created the company profile
  primaryUserId: varchar("primary_user_id").notNull().references(() => users.id),
  companyName: text("company_name").notNull(),
  industry: text("industry"),
  website: text("website"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  // Stripe integration fields
  stripeCustomerId: text("stripe_customer_id"),
  // Client payment configuration: pay_as_you_go (default), monthly_payment, deduct_from_royalties
  paymentConfiguration: text("payment_configuration").notNull().default("pay_as_you_go"),
  // For monthly payment clients - day of month for invoicing (1-28)
  invoiceDay: integer("invoice_day"),
  // Billing address (stored as JSON)
  billingAddress: jsonb("billing_address"),
  // Tri-POD product discount tier: none (default), power_level (10%), oms_subscription (15%), enterprise (20%)
  tripodDiscountTier: text("tripod_discount_tier").notNull().default("none"),
  // Payment overdue tracking for Monthly Payment clients
  paymentOverdue: boolean("payment_overdue").notNull().default(false),
  paymentRetryCount: integer("payment_retry_count").notNull().default(0),
  lastPaymentRetryAt: timestamp("last_payment_retry_at"),
  paymentOverdueAt: timestamp("payment_overdue_at"),
  // Soft delete timestamp - when set, client company is considered deleted
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Client Companies - organizational entity for multi-user clients with shared pack subscriptions
export const clientCompanies = pgTable("client_companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  industry: text("industry"),
  website: text("website"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  // Primary contact - admin user for this company
  primaryContactId: varchar("primary_contact_id").references(() => users.id),
  // Default vendor assignment for this company's pack subscriptions
  defaultVendorId: varchar("default_vendor_id").references(() => users.id),
  // Stripe integration
  stripeCustomerId: text("stripe_customer_id"),
  // Payment configuration inherited by company users
  paymentConfiguration: text("payment_configuration").notNull().default("pay_as_you_go"),
  invoiceDay: integer("invoice_day"),
  billingAddress: jsonb("billing_address"),
  // Tri-POD discount tier for company-wide pricing
  tripodDiscountTier: text("tripod_discount_tier").notNull().default("none"),
  // Notes for admin
  notes: text("notes"),
  isActive: integer("is_active").notNull().default(1),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const services = pgTable("services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description").notNull(),
  basePrice: decimal("base_price", { precision: 10, scale: 2 }).notNull(),
  priceRange: text("price_range"),
  category: text("category").notNull(),
  decorationMethods: text("decoration_methods"),
  pricingStructure: text("pricing_structure").notNull().default("single"),
  isActive: integer("is_active").notNull().default(1),
  displayOrder: integer("display_order").notNull().default(999),
  // Service hierarchy - father services are standalone, son services are add-ons
  serviceHierarchy: text("service_hierarchy").notNull().default("father"),
  // Parent service ID - only required when serviceHierarchy is "son"
  parentServiceId: varchar("parent_service_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Service pricing tiers - dynamic tier labels for complexity/quantity-based services
export const servicePricingTiers = pgTable("service_pricing_tiers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceId: varchar("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const serviceRequests = pgTable("service_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  serviceId: varchar("service_id").notNull().references(() => services.id),
  assigneeId: varchar("assignee_id").references(() => users.id),
  assignedAt: timestamp("assigned_at"),
  // Vendor assignment - tracks which vendor organization is assigned (before specific designer)
  vendorAssigneeId: varchar("vendor_assignee_id").references(() => users.id),
  vendorAssignedAt: timestamp("vendor_assigned_at"),
  status: text("status").notNull().default("pending"),
  orderNumber: text("order_number"),
  customerName: text("customer_name"),
  notes: text("notes"),
  requirements: text("requirements"),
  decorationMethod: text("decoration_method"),
  quantity: integer("quantity"),
  dueDate: timestamp("due_date"),
  deliveredAt: timestamp("delivered_at"),
  deliveredBy: varchar("delivered_by").references(() => users.id),
  changeRequestNote: text("change_request_note"),
  completedAt: timestamp("completed_at"),
  formData: jsonb("form_data"),
  // Final calculated price for the client - stored at submission time
  finalPrice: decimal("final_price", { precision: 10, scale: 2 }),
  // Discount coupon tracking
  discountCouponId: varchar("discount_coupon_id"),
  discountCouponCode: text("discount_coupon_code"),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }),
  // Automation fields
  autoAssignmentStatus: text("auto_assignment_status").default("not_attempted"),
  lastAutomationRunAt: timestamp("last_automation_run_at"),
  lastAutomationNote: text("last_automation_note"),
  lockedAssignment: boolean("locked_assignment").notNull().default(false),
  // Vendor payment tracking
  vendorPaymentStatus: text("vendor_payment_status").default("pending"),
  vendorPaymentPeriod: text("vendor_payment_period"), // Format: YYYY-MM
  vendorPaymentMarkedAt: timestamp("vendor_payment_marked_at"),
  vendorPaymentMarkedBy: varchar("vendor_payment_marked_by").references(() => users.id),
  vendorCost: decimal("vendor_cost", { precision: 10, scale: 2 }),
  // Monthly pack pricing tracking
  monthlyPackSubscriptionId: varchar("monthly_pack_subscription_id"),
  monthlyPackUnitPrice: decimal("monthly_pack_unit_price", { precision: 10, scale: 2 }),
  // Pack coverage tracking - determines if this service is covered by a pack subscription
  isPackCovered: boolean("is_pack_covered").default(false), // True if service is included in pack (shows "Included in Pack" badge)
  packSubscriptionId: varchar("pack_subscription_id").references(() => clientPackSubscriptions.id), // Link to the pack subscription covering this request
  // Pack overage tracking - when client exceeds pack quota, charged at retail price with client discount
  isPackOverage: boolean("is_pack_overage").default(false), // True if this is an overage beyond pack quota
  overageRetailPrice: decimal("overage_retail_price", { precision: 10, scale: 2 }), // Retail price before client discount
  overageClientDiscount: decimal("overage_client_discount", { precision: 5, scale: 2 }), // Client discount percentage applied (from tripodDiscountTier)
  // Client payment tracking (for Monthly Payment and Deduct from Royalties clients)
  clientPaymentStatus: text("client_payment_status").default("pending"), // 'pending' | 'paid' | 'included_in_pack'
  clientPaymentPeriod: text("client_payment_period"), // Format: YYYY-MM (billing period)
  clientPaymentMarkedAt: timestamp("client_payment_marked_at"),
  clientPaymentMarkedBy: varchar("client_payment_marked_by").references(() => users.id),
  // Stripe charge tracking
  stripePaymentIntentId: text("stripe_payment_intent_id"), // For Pay as you Go immediate charges
  stripeInvoiceId: text("stripe_invoice_id"), // For Monthly Payment consolidated charges
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Service deliveries - tracks each delivery version for change request cycles
export const serviceDeliveries = pgTable("service_deliveries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestId: varchar("request_id").notNull().references(() => serviceRequests.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  deliveredBy: varchar("delivered_by").notNull().references(() => users.id),
  deliveredAt: timestamp("delivered_at").defaultNow().notNull(),
  // Files stored as JSON array: [{ url: string, fileName: string }]
  files: jsonb("files").notNull().default([]),
});

export const serviceAttachments = pgTable("service_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestId: varchar("request_id").notNull().references(() => serviceRequests.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileType: text("file_type"),
  kind: text("kind").notNull().default("request"),
  uploadedBy: varchar("uploaded_by").references(() => users.id),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  // Link to delivery version (for kind="deliverable" attachments)
  deliveryId: varchar("delivery_id").references(() => serviceDeliveries.id, { onDelete: "set null" }),
});

export const comments = pgTable("comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestId: varchar("request_id").notNull().references(() => serviceRequests.id, { onDelete: "cascade" }),
  authorId: varchar("author_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  visibility: text("visibility").notNull().default("public"),
  parentId: varchar("parent_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// System settings for pricing configuration
export const systemSettings = pgTable("system_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  settingKey: text("setting_key").notNull().unique(),
  settingValue: jsonb("setting_value"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ==================== PHASE 2: BUNDLES & SERVICE PACKS ====================

// Bundle line items - tasks only available within bundles (not standalone services)
export const bundleLineItems = pgTable("bundle_line_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Bundles - combines services and line items with discounts
export const bundles = pgTable("bundles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  discountPercent: decimal("discount_percent", { precision: 5, scale: 2 }).default("0"),
  finalPrice: decimal("final_price", { precision: 10, scale: 2 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Bundle items - links bundles to services or line items with quantities
export const bundleItems = pgTable("bundle_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bundleId: varchar("bundle_id").notNull().references(() => bundles.id, { onDelete: "cascade" }),
  serviceId: varchar("service_id").references(() => services.id),
  lineItemId: varchar("line_item_id").references(() => bundleLineItems.id),
  quantity: integer("quantity").notNull().default(1),
});

// Monthly Packs - subscription packs with included service quantities per month
export const monthlyPacks = pgTable("monthly_packs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Monthly pack services - links packs to services with included quantities
export const monthlyPackServices = pgTable("monthly_pack_services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  packId: varchar("pack_id").notNull().references(() => monthlyPacks.id, { onDelete: "cascade" }),
  serviceId: varchar("service_id").notNull().references(() => services.id),
  includedQuantity: integer("included_quantity").notNull(),
});

// Client monthly pack subscriptions - tracks which client companies have active packs
export const clientMonthlyPackSubscriptions = pgTable("client_monthly_pack_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientProfileId: varchar("client_profile_id").notNull().references(() => clientProfiles.id),
  packId: varchar("pack_id").notNull().references(() => monthlyPacks.id),
  isActive: boolean("is_active").notNull().default(true),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  priceAtSubscription: decimal("price_at_subscription", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Monthly pack usage - tracks consumption per month per service per subscription
export const monthlyPackUsage = pgTable("monthly_pack_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  subscriptionId: varchar("subscription_id").notNull().references(() => clientMonthlyPackSubscriptions.id, { onDelete: "cascade" }),
  serviceId: varchar("service_id").notNull().references(() => services.id),
  periodMonth: integer("period_month").notNull(),
  periodYear: integer("period_year").notNull(),
  usedQuantity: integer("used_quantity").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Service Packs - subscription packs with single service per pack
export const servicePacks = pgTable("service_packs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  serviceId: varchar("service_id").references(() => services.id), // Single service per pack (new single-service enforcement)
  quantity: integer("quantity"), // Quantity of the single service included
  stripeProductId: text("stripe_product_id"), // Stripe product ID for this pack
  stripePriceId: text("stripe_price_id"), // Stripe price ID for monthly subscription
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Service pack items - links packs to services with monthly quantities
export const servicePackItems = pgTable("service_pack_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  packId: varchar("pack_id").notNull().references(() => servicePacks.id, { onDelete: "cascade" }),
  serviceId: varchar("service_id").notNull().references(() => services.id),
  quantity: integer("quantity").notNull(),
});

// Client pack subscriptions - tracks client's active packs and consumption
export const clientPackSubscriptions = pgTable("client_pack_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  clientProfileId: varchar("client_profile_id").references(() => clientProfiles.id),
  packId: varchar("pack_id").notNull().references(() => servicePacks.id),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  priceAtSubscription: decimal("price_at_subscription", { precision: 10, scale: 2 }),
  consumedQuantities: jsonb("consumed_quantities"), // { serviceId: consumedCount }
  isActive: boolean("is_active").notNull().default(true),
  // Stripe subscription fields
  stripeSubscriptionId: text("stripe_subscription_id"), // Stripe subscription ID
  stripeStatus: text("stripe_status"), // active, past_due, canceled, trialing, etc.
  currentPeriodStart: timestamp("current_period_start"), // Current billing period start
  currentPeriodEnd: timestamp("current_period_end"), // Current billing period end
  billingAnchorDay: integer("billing_anchor_day"), // Day of month for billing (1-28)
  // Grace period for failed payments
  gracePeriodEndsAt: timestamp("grace_period_ends_at"), // 2 weeks after payment failure
  paymentFailedAt: timestamp("payment_failed_at"), // When payment first failed
  cancelAt: timestamp("cancel_at"), // When subscription will be canceled (from Stripe cancel_at)
  // Vendor assignment
  vendorAssigneeId: varchar("vendor_assignee_id").references(() => users.id), // Vendor managing this pack
  vendorAssignedAt: timestamp("vendor_assigned_at"),
  // Pending vendor reassignment (effective next cycle)
  pendingVendorAssigneeId: varchar("pending_vendor_assignee_id").references(() => users.id), // Vendor to switch to next cycle
  pendingVendorEffectiveAt: timestamp("pending_vendor_effective_at"), // When the vendor change takes effect
  // Pending upgrade/downgrade (effective next cycle)
  pendingPackId: varchar("pending_pack_id").references(() => servicePacks.id), // Pack to switch to next cycle
  pendingChangeType: text("pending_change_type"), // 'upgrade' | 'downgrade' | null
  pendingChangeEffectiveAt: timestamp("pending_change_effective_at"), // When the change takes effect
  // Unsubscribe tracking
  unsubscribedAt: timestamp("unsubscribed_at"), // When client requested unsubscribe
  unsubscribeEffectiveAt: timestamp("unsubscribe_effective_at"), // End of current cycle
  // Payment tracking for Deduct from Royalties clients
  royaltiesPaymentStatus: text("royalties_payment_status").default("pending"), // 'pending' | 'paid'
  royaltiesMarkedPaidAt: timestamp("royalties_marked_paid_at"),
  royaltiesMarkedPaidBy: varchar("royalties_marked_paid_by").references(() => users.id),
  // Vendor payment tracking
  vendorPaymentStatus: text("vendor_payment_status").default("pending"), // 'pending' | 'paid'
  vendorPaymentPeriod: text("vendor_payment_period"), // Format: YYYY-MM
  vendorPaymentMarkedAt: timestamp("vendor_payment_marked_at"),
  vendorPaymentMarkedBy: varchar("vendor_payment_marked_by").references(() => users.id),
  vendorCost: decimal("vendor_cost", { precision: 10, scale: 2 }), // Vendor cost for this subscription period
  clientCompanyId: varchar("client_company_id").references(() => clientCompanies.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Service pack usage - tracks per-service usage per month
export const servicePackUsage = pgTable("service_pack_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  subscriptionId: varchar("subscription_id").notNull().references(() => clientPackSubscriptions.id, { onDelete: "cascade" }),
  serviceId: varchar("service_id").notNull().references(() => services.id),
  periodMonth: integer("period_month").notNull(),
  periodYear: integer("period_year").notNull(),
  usedQuantity: integer("used_quantity").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Vendor bundle costs - vendor-specific pricing for bundles
export const vendorBundleCosts = pgTable("vendor_bundle_costs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  vendorId: varchar("vendor_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  bundleId: varchar("bundle_id").notNull().references(() => bundles.id, { onDelete: "cascade" }),
  cost: decimal("cost", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Vendor pack costs - vendor-specific pricing for service packs
export const vendorPackCosts = pgTable("vendor_pack_costs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  vendorId: varchar("vendor_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  packId: varchar("pack_id").notNull().references(() => servicePacks.id, { onDelete: "cascade" }),
  cost: decimal("cost", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ==================== END PHASE 2 TABLES ====================

// ==================== PHASE 3: CONFIGURABLE INPUT FIELDS ====================

// Input field types enum
export const inputFieldTypes = [
  "text",
  "textarea", 
  "number",
  "dropdown",
  "multi_select",
  "radio",
  "checkbox",
  "file",
  "url",
  "date",
  "chips"
] as const;
export type InputFieldType = typeof inputFieldTypes[number];

// Value modes for fields
export const valueModes = ["single", "multiple"] as const;
export type ValueMode = typeof valueModes[number];

// Assign to modes for input fields - determines where field can be used
export const assignToModes = ["service", "line_item", "bundle", "all"] as const;
export type AssignToMode = typeof assignToModes[number];

// Input fields - global reusable field definitions
export const inputFields = pgTable("input_fields", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fieldKey: text("field_key").notNull().unique(),
  label: text("label").notNull(),
  description: text("description"),
  inputType: text("input_type").notNull(),
  valueMode: text("value_mode").notNull().default("single"),
  assignTo: text("assign_to").notNull().default("service"),
  inputFor: text("input_for").notNull().default("request"),
  showOnBundleForm: boolean("show_on_bundle_form").notNull().default(true),
  validation: jsonb("validation"),
  globalDefaultValue: jsonb("global_default_value"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Service fields - join table linking input fields to services with per-service configuration
export const serviceFields = pgTable("service_fields", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceId: varchar("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  inputFieldId: varchar("input_field_id").notNull().references(() => inputFields.id, { onDelete: "cascade" }),
  required: boolean("required").notNull().default(false),
  displayLabelOverride: text("display_label_override"),
  helpTextOverride: text("help_text_override"),
  placeholderOverride: text("placeholder_override"),
  valueModeOverride: text("value_mode_override"),
  optionsJson: jsonb("options_json"),
  defaultValue: jsonb("default_value"),
  uiGroup: text("ui_group"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Line item fields - join table linking input fields to line items with per-line-item configuration
export const lineItemFields = pgTable("line_item_fields", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lineItemId: varchar("line_item_id").notNull().references(() => bundleLineItems.id, { onDelete: "cascade" }),
  inputFieldId: varchar("input_field_id").notNull().references(() => inputFields.id, { onDelete: "cascade" }),
  required: boolean("required").notNull().default(false),
  displayLabelOverride: text("display_label_override"),
  helpTextOverride: text("help_text_override"),
  placeholderOverride: text("placeholder_override"),
  valueModeOverride: text("value_mode_override"),
  optionsJson: jsonb("options_json"),
  defaultValue: jsonb("default_value"),
  uiGroup: text("ui_group"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Bundle fields - join table linking input fields to bundles with per-bundle configuration
export const bundleFields = pgTable("bundle_fields", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bundleId: varchar("bundle_id").notNull().references(() => bundles.id, { onDelete: "cascade" }),
  inputFieldId: varchar("input_field_id").notNull().references(() => inputFields.id, { onDelete: "cascade" }),
  required: boolean("required").notNull().default(false),
  displayLabelOverride: text("display_label_override"),
  helpTextOverride: text("help_text_override"),
  placeholderOverride: text("placeholder_override"),
  valueModeOverride: text("value_mode_override"),
  optionsJson: jsonb("options_json"),
  defaultValue: jsonb("default_value"),
  uiGroup: text("ui_group"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ==================== END PHASE 3 TABLES ====================

// ==================== PHASE 4: BUNDLE REQUESTS ====================

// Service request status workflow
export const serviceRequestStatuses = ["pending", "payment_failed", "in-progress", "delivered", "change-request", "canceled"] as const;
export type ServiceRequestStatus = typeof serviceRequestStatuses[number];

// Bundle request status workflow
export const bundleRequestStatuses = ["pending", "payment_failed", "in-progress", "delivered", "change-request", "canceled"] as const;
export type BundleRequestStatus = typeof bundleRequestStatuses[number];

// Bundle requests - tracks client submissions for bundles
export const bundleRequests = pgTable("bundle_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  bundleId: varchar("bundle_id").notNull().references(() => bundles.id),
  assigneeId: varchar("assignee_id").references(() => users.id),
  assignedAt: timestamp("assigned_at"),
  // Vendor assignment - tracks which vendor organization is assigned (before specific designer)
  vendorAssigneeId: varchar("vendor_assignee_id").references(() => users.id),
  vendorAssignedAt: timestamp("vendor_assigned_at"),
  status: text("status").notNull().default("pending"),
  // Client input values for service fields (keyed by serviceId + inputFieldId)
  formData: jsonb("form_data"),
  // Designer input values for line item fields (keyed by lineItemId + inputFieldId)
  lineItemData: jsonb("line_item_data"),
  notes: text("notes"),
  dueDate: timestamp("due_date"),
  deliveredAt: timestamp("delivered_at"),
  deliveredBy: varchar("delivered_by").references(() => users.id),
  changeRequestNote: text("change_request_note"),
  // Discount coupon tracking
  discountCouponId: varchar("discount_coupon_id"),
  discountCouponCode: text("discount_coupon_code"),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }),
  finalPrice: decimal("final_price", { precision: 10, scale: 2 }),
  // Vendor payment tracking
  vendorPaymentStatus: text("vendor_payment_status").default("pending"),
  vendorPaymentPeriod: text("vendor_payment_period"), // Format: YYYY-MM
  vendorPaymentMarkedAt: timestamp("vendor_payment_marked_at"),
  vendorPaymentMarkedBy: varchar("vendor_payment_marked_by").references(() => users.id),
  vendorCost: decimal("vendor_cost", { precision: 10, scale: 2 }),
  // Client payment tracking (for Monthly Payment and Deduct from Royalties clients)
  clientPaymentStatus: text("client_payment_status").default("pending"), // 'pending' | 'paid'
  clientPaymentPeriod: text("client_payment_period"), // Format: YYYY-MM (billing period)
  clientPaymentMarkedAt: timestamp("client_payment_marked_at"),
  clientPaymentMarkedBy: varchar("client_payment_marked_by").references(() => users.id),
  // Stripe charge tracking
  stripePaymentIntentId: text("stripe_payment_intent_id"), // For Pay as you Go immediate charges
  stripeInvoiceId: text("stripe_invoice_id"), // For Monthly Payment consolidated charges
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Bundle request attachments - files associated with bundle requests
export const bundleRequestAttachments = pgTable("bundle_request_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestId: varchar("request_id").notNull().references(() => bundleRequests.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileType: text("file_type"),
  kind: text("kind").notNull().default("request"), // request, delivery
  uploadedBy: varchar("uploaded_by").references(() => users.id),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

// Bundle request comments - discussion threads on bundle requests
export const bundleRequestComments = pgTable("bundle_request_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestId: varchar("request_id").notNull().references(() => bundleRequests.id, { onDelete: "cascade" }),
  authorId: varchar("author_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  visibility: text("visibility").notNull().default("public"),
  parentId: varchar("parent_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ==================== END PHASE 4 TABLES ====================

// ==================== PHASE 5: AUTOMATION ENGINE ====================

// Auto-assignment status for service requests
export const autoAssignmentStatuses = [
  "not_attempted",
  "assigned",
  "partial_assigned",
  "failed_no_vendor",
  "failed_no_designer", 
  "failed_capacity"
] as const;
export type AutoAssignmentStatus = typeof autoAssignmentStatuses[number];

// Routing strategies for automation
export const routingStrategies = ["least_loaded", "round_robin", "priority_first"] as const;
export type RoutingStrategy = typeof routingStrategies[number];

// Automation rule scopes
export const automationScopes = ["global", "vendor"] as const;
export type AutomationScope = typeof automationScopes[number];

// Routing targets
export const routingTargets = ["vendor_only", "vendor_then_designer"] as const;
export type RoutingTarget = typeof routingTargets[number];

// Fallback actions when automation fails
export const fallbackActions = ["leave_pending", "notify_only"] as const;
export type FallbackAction = typeof fallbackActions[number];

// Vendor service capacities - tracks which services a vendor supports and their daily capacity
export const vendorServiceCapacities = pgTable("vendor_service_capacities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  vendorProfileId: varchar("vendor_profile_id").notNull().references(() => vendorProfiles.id, { onDelete: "cascade" }),
  serviceId: varchar("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  dailyCapacity: integer("daily_capacity").notNull().default(0),
  autoAssignEnabled: boolean("auto_assign_enabled").notNull().default(true),
  priority: integer("priority").notNull().default(0),
  routingStrategy: text("routing_strategy").notNull().default("least_loaded"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("vendor_service_capacity_unique").on(table.vendorProfileId, table.serviceId),
]);

// Vendor designer capacities - tracks which services a designer can work on and their daily capacity
export const vendorDesignerCapacities = pgTable("vendor_designer_capacities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  serviceId: varchar("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  dailyCapacity: integer("daily_capacity").notNull().default(0),
  isPrimary: boolean("is_primary").notNull().default(false),
  autoAssignEnabled: boolean("auto_assign_enabled").notNull().default(true),
  priority: integer("priority").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("vendor_designer_capacity_unique").on(table.userId, table.serviceId),
]);

// Automation rules - configurable rules for auto-assignment
export const automationRules = pgTable("automation_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  scope: text("scope").notNull().default("global"),
  // For vendor-scoped rules, which vendor owns this rule
  ownerVendorId: varchar("owner_vendor_id").references(() => users.id, { onDelete: "cascade" }),
  isActive: boolean("is_active").notNull().default(true),
  priority: integer("priority").notNull().default(0),
  // Which service types this rule applies to (null = all services)
  serviceIds: jsonb("service_ids"),
  routingTarget: text("routing_target").notNull().default("vendor_only"),
  routingStrategy: text("routing_strategy").notNull().default("least_loaded"),
  // Allowlist/blocklist for vendors (global rules only)
  allowedVendorIds: jsonb("allowed_vendor_ids"),
  excludedVendorIds: jsonb("excluded_vendor_ids"),
  fallbackAction: text("fallback_action").notNull().default("leave_pending"),
  // Match criteria (JSON: { clientId?, rush?, vip?, etc. })
  matchCriteria: jsonb("match_criteria"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Automation assignment logs - audit trail for auto-assignment decisions
export const automationAssignmentLogs = pgTable("automation_assignment_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestId: varchar("request_id").notNull().references(() => serviceRequests.id, { onDelete: "cascade" }),
  requestType: text("request_type").notNull().default("service"),
  ruleId: varchar("rule_id").references(() => automationRules.id, { onDelete: "set null" }),
  step: text("step").notNull(),
  candidatesConsidered: jsonb("candidates_considered"),
  chosenId: varchar("chosen_id"),
  result: text("result").notNull(),
  reason: text("reason"),
  capacitySnapshot: jsonb("capacity_snapshot"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ==================== END PHASE 5 TABLES ====================

// ==================== PHASE 6: DISCOUNT COUPONS ====================

// Discount coupon types
export const discountCouponTypes = ["amount", "percentage"] as const;
export type DiscountCouponType = typeof discountCouponTypes[number];

// Discount coupons - promotional codes for services and bundles
export const discountCoupons = pgTable("discount_coupons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  discountType: text("discount_type").notNull(), // "amount" or "percentage"
  discountValue: decimal("discount_value", { precision: 10, scale: 2 }).notNull(),
  // Service/Bundle scope flags (true = applies to services/bundles, false = does not apply)
  appliesToServices: boolean("applies_to_services").notNull().default(true),
  appliesToBundles: boolean("applies_to_bundles").notNull().default(true),
  // Service/Bundle restrictions (null = all services/bundles when appliesToX is true)
  serviceId: varchar("service_id").references(() => services.id, { onDelete: "set null" }),
  bundleId: varchar("bundle_id").references(() => bundles.id, { onDelete: "set null" }),
  // Usage limits
  maxUses: integer("max_uses").notNull().default(1),
  currentUses: integer("current_uses").notNull().default(0),
  // Client restriction (null = any client)
  clientId: varchar("client_id").references(() => users.id, { onDelete: "set null" }),
  // Valid date range
  validFrom: timestamp("valid_from"),
  validTo: timestamp("valid_to"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ==================== END PHASE 6 TABLES ====================

// ==================== PHASE 7: STRIPE PAYMENT INTEGRATION ====================

// Client payment methods - stores saved cards linked to Stripe
export const clientPaymentMethods = pgTable("client_payment_methods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientProfileId: varchar("client_profile_id").notNull().references(() => clientProfiles.id, { onDelete: "cascade" }),
  // Stripe payment method ID
  stripePaymentMethodId: text("stripe_payment_method_id").notNull(),
  // Card details (only store safe display info, never full card number)
  brand: text("brand").notNull(), // visa, mastercard, amex, etc.
  last4: text("last4").notNull(), // last 4 digits
  expMonth: integer("exp_month").notNull(),
  expYear: integer("exp_year").notNull(),
  // Whether this is the default payment method
  isDefault: boolean("is_default").notNull().default(false),
  // Billing address for this specific card
  billingAddress: jsonb("billing_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Stripe events - for webhook idempotency and audit trail
export const stripeEvents = pgTable("stripe_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  stripeEventId: text("stripe_event_id").notNull().unique(),
  eventType: text("event_type").notNull(),
  eventData: jsonb("event_data"),
  processed: boolean("processed").notNull().default(false),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Payments - tracks all payment transactions
export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientProfileId: varchar("client_profile_id").notNull().references(() => clientProfiles.id),
  // Link to the service request or bundle request that was paid
  serviceRequestId: varchar("service_request_id").references(() => serviceRequests.id, { onDelete: "set null" }),
  bundleRequestId: varchar("bundle_request_id").references(() => bundleRequests.id, { onDelete: "set null" }),
  // Payment amount in cents to avoid floating point issues
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("usd"),
  // Payment status: pending, succeeded, failed, refunded, partially_refunded
  status: text("status").notNull().default("pending"),
  // How this was paid: pay_as_you_go, monthly_invoice, deduct_from_royalties
  paymentType: text("payment_type").notNull(),
  // Stripe IDs (null if deduct_from_royalties)
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeInvoiceId: text("stripe_invoice_id"),
  stripeRefundId: text("stripe_refund_id"),
  // Payment timestamps and failure tracking
  paidAt: timestamp("paid_at"),
  failureReason: text("failure_reason"),
  refundedAt: timestamp("refunded_at"),
  refundedAmount: integer("refunded_amount"), // In cents
  // For deduct_from_royalties tracking
  royaltyDeductionNotes: text("royalty_deduction_notes"),
  // Who marked as paid (for royalty deductions)
  markedPaidBy: varchar("marked_paid_by").references(() => users.id, { onDelete: "set null" }),
  markedPaidAt: timestamp("marked_paid_at"),
  // Metadata for any extra info
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Monthly Billing Records - tracks consolidated monthly charges for Monthly Payment clients
export const monthlyBillingRecords = pgTable("monthly_billing_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientProfileId: varchar("client_profile_id").notNull().references(() => clientProfiles.id, { onDelete: "cascade" }),
  // Billing period (YYYY-MM format, e.g., "2026-01" for January 2026)
  billingPeriod: text("billing_period").notNull(),
  // Record type: monthly_services (regular monthly billing), pack_exceeded (exceeded pack services)
  recordType: text("record_type").notNull().default("monthly_services"),
  // Payment amounts in cents
  subtotalCents: integer("subtotal_cents").notNull(),
  processingFeeCents: integer("processing_fee_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull(),
  // Number of services/items included
  servicesCount: integer("services_count").notNull().default(0),
  // Job IDs included in this billing record (for audit trail)
  includedJobIds: jsonb("included_job_ids"), // Array of { type: 'service'|'bundle', id: string }
  // Status: pending, processing, completed, failed
  status: text("status").notNull().default("pending"),
  // Stripe transaction details
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeChargeId: text("stripe_charge_id"),
  // Retry tracking
  retryCount: integer("retry_count").notNull().default(0),
  lastRetryAt: timestamp("last_retry_at"),
  failureReason: text("failure_reason"),
  // Timestamps
  processedAt: timestamp("processed_at"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Admin notifications for system alerts (payment failures, etc.)
export const adminNotificationTypes = ["payment_failed", "subscription_failed", "system_alert"] as const;
export type AdminNotificationType = typeof adminNotificationTypes[number];

export const adminNotifications = pgTable("admin_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(), // payment_failed, subscription_failed, system_alert
  title: text("title").notNull(),
  message: text("message").notNull(),
  // Related entities
  clientProfileId: varchar("client_profile_id"),
  billingRecordId: varchar("billing_record_id"),
  // Metadata for additional context
  metadata: jsonb("metadata"),
  // Read/dismissed status
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at"),
  readByUserId: varchar("read_by_user_id"),
  isDismissed: boolean("is_dismissed").notNull().default(false),
  dismissedAt: timestamp("dismissed_at"),
  dismissedByUserId: varchar("dismissed_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ==================== END PHASE 7 TABLES ====================

export const insertAdminNotificationSchema = createInsertSchema(adminNotifications).omit({
  id: true,
  createdAt: true,
});

export type InsertAdminNotification = z.infer<typeof insertAdminNotificationSchema>;
export type AdminNotification = typeof adminNotifications.$inferSelect;

// In-App Notification types for all user roles
export const notificationTypes = [
  "service_request_submitted", "service_request_admin", "job_in_progress",
  "job_change_request", "job_change_request_vendor", "job_delivered",
  "job_assigned_vendor", "bulk_job_assigned_vendor", "job_assigned_designer", "bulk_job_assigned_designer",
  "job_canceled", "job_canceled_vendor", "refund_processed",
  "pack_activated", "pack_activated_admin", "pack_canceled", "pack_canceled_admin", "pack_canceled_vendor",
  "pack_assigned_vendor", "pack_upgraded", "pack_upgraded_admin", "pack_upgraded_vendor",
  "pack_downgraded", "pack_downgraded_admin", "pack_downgraded_vendor",
  "pack_renewed", "pack_usage_warning", "pack_fully_used",
  "new_services_cost_input"
] as const;
export type NotificationType = typeof notificationTypes[number];

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  link: text("link"),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
  readAt: true,
});

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  phone: true,
  role: true,
  vendorId: true,
  clientProfileId: true,
  clientCompanyId: true,
  paymentMethod: true,
  invitedBy: true,
});

export const insertVendorProfileSchema = createInsertSchema(vendorProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateVendorProfileSchema = createInsertSchema(vendorProfiles).partial().omit({
  id: true,
  createdAt: true,
});

export const insertClientProfileSchema = createInsertSchema(clientProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateClientProfileSchema = createInsertSchema(clientProfiles).partial().omit({
  id: true,
  primaryUserId: true,
  createdAt: true,
});

export const insertClientCompanySchema = createInsertSchema(clientCompanies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateClientCompanySchema = createInsertSchema(clientCompanies).partial().omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertServiceSchema = createInsertSchema(services).omit({
  id: true,
  createdAt: true,
});

export const updateServiceSchema = createInsertSchema(services).partial().omit({
  id: true,
  createdAt: true,
});

export const insertServicePricingTierSchema = createInsertSchema(servicePricingTiers).omit({
  id: true,
  createdAt: true,
});

export const updateServicePricingTierSchema = createInsertSchema(servicePricingTiers).partial().omit({
  id: true,
  createdAt: true,
});

export const insertServiceRequestSchema = createInsertSchema(serviceRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deliveredAt: true,
  deliveredBy: true,
  completedAt: true,
});

export const updateServiceRequestSchema = createInsertSchema(serviceRequests).partial().omit({
  id: true,
  createdAt: true,
});

export const insertAttachmentSchema = createInsertSchema(serviceAttachments).omit({
  id: true,
  uploadedAt: true,
});

// Service delivery schemas
export const insertServiceDeliverySchema = createInsertSchema(serviceDeliveries).omit({
  id: true,
  deliveredAt: true,
});
export type InsertServiceDelivery = z.infer<typeof insertServiceDeliverySchema>;
export type ServiceDelivery = typeof serviceDeliveries.$inferSelect;

export const insertCommentSchema = createInsertSchema(comments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Phase 2: Bundle & Pack schemas
export const insertBundleLineItemSchema = createInsertSchema(bundleLineItems).omit({
  id: true,
  createdAt: true,
});

export const insertBundleSchema = createInsertSchema(bundles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBundleItemSchema = createInsertSchema(bundleItems).omit({
  id: true,
});

export const insertServicePackSchema = createInsertSchema(servicePacks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertServicePackItemSchema = createInsertSchema(servicePackItems).omit({
  id: true,
});

export const insertClientPackSubscriptionSchema = createInsertSchema(clientPackSubscriptions).omit({
  id: true,
  createdAt: true,
});

export const insertServicePackUsageSchema = createInsertSchema(servicePackUsage).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Monthly Pack schemas
export const insertMonthlyPackSchema = createInsertSchema(monthlyPacks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateMonthlyPackSchema = createInsertSchema(monthlyPacks).partial().omit({
  id: true,
  createdAt: true,
});

export const insertMonthlyPackServiceSchema = createInsertSchema(monthlyPackServices).omit({
  id: true,
});

export const insertClientMonthlyPackSubscriptionSchema = createInsertSchema(clientMonthlyPackSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateClientMonthlyPackSubscriptionSchema = createInsertSchema(clientMonthlyPackSubscriptions).partial().omit({
  id: true,
  createdAt: true,
});

export const insertMonthlyPackUsageSchema = createInsertSchema(monthlyPackUsage).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateMonthlyPackUsageSchema = createInsertSchema(monthlyPackUsage).partial().omit({
  id: true,
  createdAt: true,
});

// Phase 3: Input Fields schemas
export const insertInputFieldSchema = createInsertSchema(inputFields).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateInputFieldSchema = createInsertSchema(inputFields).partial().omit({
  id: true,
  createdAt: true,
});

export const insertServiceFieldSchema = createInsertSchema(serviceFields).omit({
  id: true,
  createdAt: true,
});

export const updateServiceFieldSchema = createInsertSchema(serviceFields).partial().omit({
  id: true,
  createdAt: true,
});

export const insertLineItemFieldSchema = createInsertSchema(lineItemFields).omit({
  id: true,
  createdAt: true,
});

export const updateLineItemFieldSchema = createInsertSchema(lineItemFields).partial().omit({
  id: true,
  createdAt: true,
});

export const insertBundleFieldSchema = createInsertSchema(bundleFields).omit({
  id: true,
  createdAt: true,
});

export const updateBundleFieldSchema = createInsertSchema(bundleFields).partial().omit({
  id: true,
  createdAt: true,
});

// Vendor bundle/pack cost schemas
export const insertVendorBundleCostSchema = createInsertSchema(vendorBundleCosts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertVendorPackCostSchema = createInsertSchema(vendorPackCosts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Phase 4: Bundle Request schemas
export const insertBundleRequestSchema = createInsertSchema(bundleRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deliveredAt: true,
  deliveredBy: true,
});

export const updateBundleRequestSchema = createInsertSchema(bundleRequests).partial().omit({
  id: true,
  createdAt: true,
});

export const insertBundleRequestAttachmentSchema = createInsertSchema(bundleRequestAttachments).omit({
  id: true,
  uploadedAt: true,
});

export const insertBundleRequestCommentSchema = createInsertSchema(bundleRequestComments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Phase 5: Automation Engine schemas
export const insertVendorServiceCapacitySchema = createInsertSchema(vendorServiceCapacities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateVendorServiceCapacitySchema = createInsertSchema(vendorServiceCapacities).partial().omit({
  id: true,
  vendorProfileId: true,
  serviceId: true,
  createdAt: true,
});

export const insertVendorDesignerCapacitySchema = createInsertSchema(vendorDesignerCapacities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateVendorDesignerCapacitySchema = createInsertSchema(vendorDesignerCapacities).partial().omit({
  id: true,
  userId: true,
  serviceId: true,
  createdAt: true,
});

export const insertAutomationRuleSchema = createInsertSchema(automationRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateAutomationRuleSchema = createInsertSchema(automationRules).partial().omit({
  id: true,
  createdAt: true,
});

export const insertAutomationAssignmentLogSchema = createInsertSchema(automationAssignmentLogs).omit({
  id: true,
  createdAt: true,
});

// Phase 6: Discount Coupons schemas
export const insertDiscountCouponSchema = createInsertSchema(discountCoupons).omit({
  id: true,
  currentUses: true,
  createdAt: true,
  updatedAt: true,
});

export const updateDiscountCouponSchema = createInsertSchema(discountCoupons).partial().omit({
  id: true,
  currentUses: true,
  createdAt: true,
});

// Phase 7: Stripe Payment Integration schemas
export const insertClientPaymentMethodSchema = createInsertSchema(clientPaymentMethods).omit({
  id: true,
  createdAt: true,
});

export const insertStripeEventSchema = createInsertSchema(stripeEvents).omit({
  id: true,
  createdAt: true,
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMonthlyBillingRecordSchema = createInsertSchema(monthlyBillingRecords).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateMonthlyBillingRecordSchema = createInsertSchema(monthlyBillingRecords).partial().omit({
  id: true,
  clientProfileId: true,
  billingPeriod: true,
  createdAt: true,
  updatedAt: true,
});

export const updatePaymentSchema = createInsertSchema(payments).partial().omit({
  id: true,
  clientProfileId: true,
  createdAt: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type VendorProfile = typeof vendorProfiles.$inferSelect;
export type InsertVendorProfile = z.infer<typeof insertVendorProfileSchema>;
export type UpdateVendorProfile = z.infer<typeof updateVendorProfileSchema>;
export type ClientProfile = typeof clientProfiles.$inferSelect;
export type InsertClientProfile = z.infer<typeof insertClientProfileSchema>;
export type UpdateClientProfile = z.infer<typeof updateClientProfileSchema>;
export type ClientCompany = typeof clientCompanies.$inferSelect;
export type InsertClientCompany = z.infer<typeof insertClientCompanySchema>;
export type UpdateClientCompany = z.infer<typeof updateClientCompanySchema>;
export type Service = typeof services.$inferSelect;
export type InsertService = z.infer<typeof insertServiceSchema>;
export type UpdateService = z.infer<typeof updateServiceSchema>;
export type ServicePricingTier = typeof servicePricingTiers.$inferSelect;
export type InsertServicePricingTier = z.infer<typeof insertServicePricingTierSchema>;
export type UpdateServicePricingTier = z.infer<typeof updateServicePricingTierSchema>;
export type ServiceRequest = typeof serviceRequests.$inferSelect;
export type InsertServiceRequest = z.infer<typeof insertServiceRequestSchema>;
export type UpdateServiceRequest = z.infer<typeof updateServiceRequestSchema>;
export type ServiceAttachment = typeof serviceAttachments.$inferSelect;
export type InsertAttachment = z.infer<typeof insertAttachmentSchema>;
export type Comment = typeof comments.$inferSelect;
export type InsertComment = z.infer<typeof insertCommentSchema>;
export type SystemSetting = typeof systemSettings.$inferSelect;

// Phase 2: Bundle & Pack types
export type BundleLineItem = typeof bundleLineItems.$inferSelect;
export type InsertBundleLineItem = z.infer<typeof insertBundleLineItemSchema>;
export type Bundle = typeof bundles.$inferSelect;
export type InsertBundle = z.infer<typeof insertBundleSchema>;
export type BundleItem = typeof bundleItems.$inferSelect;
export type InsertBundleItem = z.infer<typeof insertBundleItemSchema>;
export type ServicePack = typeof servicePacks.$inferSelect;
export type InsertServicePack = z.infer<typeof insertServicePackSchema>;
export type ServicePackItem = typeof servicePackItems.$inferSelect;
export type InsertServicePackItem = z.infer<typeof insertServicePackItemSchema>;
export type ClientPackSubscription = typeof clientPackSubscriptions.$inferSelect;
export type InsertClientPackSubscription = z.infer<typeof insertClientPackSubscriptionSchema>;
export type ServicePackUsage = typeof servicePackUsage.$inferSelect;
export type InsertServicePackUsage = z.infer<typeof insertServicePackUsageSchema>;

// Monthly Pack types
export type MonthlyPack = typeof monthlyPacks.$inferSelect;
export type InsertMonthlyPack = z.infer<typeof insertMonthlyPackSchema>;
export type UpdateMonthlyPack = z.infer<typeof updateMonthlyPackSchema>;
export type MonthlyPackService = typeof monthlyPackServices.$inferSelect;
export type InsertMonthlyPackService = z.infer<typeof insertMonthlyPackServiceSchema>;
export type ClientMonthlyPackSubscription = typeof clientMonthlyPackSubscriptions.$inferSelect;
export type InsertClientMonthlyPackSubscription = z.infer<typeof insertClientMonthlyPackSubscriptionSchema>;
export type UpdateClientMonthlyPackSubscription = z.infer<typeof updateClientMonthlyPackSubscriptionSchema>;
export type MonthlyPackUsage = typeof monthlyPackUsage.$inferSelect;
export type InsertMonthlyPackUsage = z.infer<typeof insertMonthlyPackUsageSchema>;
export type UpdateMonthlyPackUsage = z.infer<typeof updateMonthlyPackUsageSchema>;

// Phase 3: Input Fields types
export type InputField = typeof inputFields.$inferSelect;
export type InsertInputField = z.infer<typeof insertInputFieldSchema>;
export type UpdateInputField = z.infer<typeof updateInputFieldSchema>;
export type ServiceField = typeof serviceFields.$inferSelect;
export type InsertServiceField = z.infer<typeof insertServiceFieldSchema>;
export type UpdateServiceField = z.infer<typeof updateServiceFieldSchema>;
export type LineItemField = typeof lineItemFields.$inferSelect;
export type InsertLineItemField = z.infer<typeof insertLineItemFieldSchema>;
export type UpdateLineItemField = z.infer<typeof updateLineItemFieldSchema>;
export type BundleField = typeof bundleFields.$inferSelect;
export type InsertBundleField = z.infer<typeof insertBundleFieldSchema>;
export type UpdateBundleField = z.infer<typeof updateBundleFieldSchema>;
export type VendorBundleCost = typeof vendorBundleCosts.$inferSelect;
export type InsertVendorBundleCost = z.infer<typeof insertVendorBundleCostSchema>;
export type VendorPackCost = typeof vendorPackCosts.$inferSelect;
export type InsertVendorPackCost = z.infer<typeof insertVendorPackCostSchema>;

// Phase 4: Bundle Request types
export type BundleRequest = typeof bundleRequests.$inferSelect;
export type InsertBundleRequest = z.infer<typeof insertBundleRequestSchema>;
export type UpdateBundleRequest = z.infer<typeof updateBundleRequestSchema>;
export type BundleRequestAttachment = typeof bundleRequestAttachments.$inferSelect;
export type InsertBundleRequestAttachment = z.infer<typeof insertBundleRequestAttachmentSchema>;
export type BundleRequestComment = typeof bundleRequestComments.$inferSelect;
export type InsertBundleRequestComment = z.infer<typeof insertBundleRequestCommentSchema>;

// Phase 5: Automation Engine types
export type VendorServiceCapacity = typeof vendorServiceCapacities.$inferSelect;
export type InsertVendorServiceCapacity = z.infer<typeof insertVendorServiceCapacitySchema>;
export type UpdateVendorServiceCapacity = z.infer<typeof updateVendorServiceCapacitySchema>;
export type VendorDesignerCapacity = typeof vendorDesignerCapacities.$inferSelect;
export type InsertVendorDesignerCapacity = z.infer<typeof insertVendorDesignerCapacitySchema>;
export type UpdateVendorDesignerCapacity = z.infer<typeof updateVendorDesignerCapacitySchema>;
export type AutomationRule = typeof automationRules.$inferSelect;
export type InsertAutomationRule = z.infer<typeof insertAutomationRuleSchema>;
export type UpdateAutomationRule = z.infer<typeof updateAutomationRuleSchema>;
export type AutomationAssignmentLog = typeof automationAssignmentLogs.$inferSelect;
export type InsertAutomationAssignmentLog = z.infer<typeof insertAutomationAssignmentLogSchema>;

// Phase 6: Discount Coupons types
export type DiscountCoupon = typeof discountCoupons.$inferSelect;
export type InsertDiscountCoupon = z.infer<typeof insertDiscountCouponSchema>;
export type UpdateDiscountCoupon = z.infer<typeof updateDiscountCouponSchema>;

// Phase 7: Stripe Payment Integration types
export type ClientPaymentMethod = typeof clientPaymentMethods.$inferSelect;
export type InsertClientPaymentMethod = z.infer<typeof insertClientPaymentMethodSchema>;
export type StripeEvent = typeof stripeEvents.$inferSelect;
export type InsertStripeEvent = z.infer<typeof insertStripeEventSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type UpdatePayment = z.infer<typeof updatePaymentSchema>;
export type MonthlyBillingRecord = typeof monthlyBillingRecords.$inferSelect;
export type InsertMonthlyBillingRecord = z.infer<typeof insertMonthlyBillingRecordSchema>;
export type UpdateMonthlyBillingRecord = z.infer<typeof updateMonthlyBillingRecordSchema>;

// ==================== REFUND MANAGEMENT ====================

// Refund types
export const refundTypes = ["full", "partial", "manual"] as const;
export type RefundType = typeof refundTypes[number];

// Refund statuses
export const refundStatuses = ["pending", "processing", "completed", "failed"] as const;
export type RefundStatus = typeof refundStatuses[number];

// Refund request types - what is being refunded
export const refundRequestTypes = ["service_request", "bundle_request"] as const;
export type RefundRequestType = typeof refundRequestTypes[number];

// Refunds table - tracks all refund records
export const refunds = pgTable("refunds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // What type of request is being refunded
  requestType: text("request_type").notNull(), // 'service_request' | 'bundle_request'
  // Reference to either service request or bundle request (only one should be set)
  serviceRequestId: varchar("service_request_id").references(() => serviceRequests.id, { onDelete: "set null" }),
  bundleRequestId: varchar("bundle_request_id").references(() => bundleRequests.id, { onDelete: "set null" }),
  // Client information
  clientId: varchar("client_id").notNull().references(() => users.id),
  // Refund details
  refundType: text("refund_type").notNull(), // 'full' | 'partial' | 'manual'
  originalAmount: decimal("original_amount", { precision: 10, scale: 2 }).notNull(), // Original charge amount
  refundAmount: decimal("refund_amount", { precision: 10, scale: 2 }).notNull(), // Amount to refund
  reason: text("reason").notNull(), // Reason for refund
  notes: text("notes"), // Internal notes
  // Status tracking
  status: text("status").notNull().default("pending"), // 'pending' | 'processing' | 'completed' | 'failed'
  errorMessage: text("error_message"), // For failed refunds
  // Stripe integration
  stripeRefundId: text("stripe_refund_id"), // Stripe refund ID (null for manual refunds)
  stripePaymentIntentId: text("stripe_payment_intent_id"), // Original payment intent ID
  // Automatic refund flag - true when triggered by job cancellation
  isAutomatic: boolean("is_automatic").notNull().default(false),
  // Audit fields
  requestedBy: varchar("requested_by").notNull().references(() => users.id),
  processedBy: varchar("processed_by").references(() => users.id),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertRefundSchema = createInsertSchema(refunds).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateRefundSchema = createInsertSchema(refunds).partial().omit({
  id: true,
  createdAt: true,
});

export type InsertRefund = z.infer<typeof insertRefundSchema>;
export type UpdateRefund = z.infer<typeof updateRefundSchema>;
export type Refund = typeof refunds.$inferSelect;

// ==================== END REFUND MANAGEMENT ====================

// ==================== IDEMPOTENCY KEYS (Duplicate Submission Prevention) ====================

export const idempotencyKeyStatuses = ["processing", "success", "failed"] as const;
export type IdempotencyKeyStatus = typeof idempotencyKeyStatuses[number];

export const idempotencyKeys = pgTable("idempotency_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: varchar("key").notNull().unique(),
  userId: varchar("user_id").notNull().references(() => users.id),
  endpoint: text("endpoint").notNull(),
  status: text("status").notNull().default("processing"),
  resultId: varchar("result_id"),
  requestHash: text("request_hash"),
  responseData: jsonb("response_data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertIdempotencyKeySchema = createInsertSchema(idempotencyKeys).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertIdempotencyKey = z.infer<typeof insertIdempotencyKeySchema>;
export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;

// ==================== END IDEMPOTENCY KEYS ====================

// Billing address structure for Stripe integration
export type BillingAddress = {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
};

// Helper type for dropdown options
export type FieldOption = {
  value: string;
  label: string;
  price?: number;
};

// Helper type for field validation rules
export type FieldValidation = {
  min?: number;
  max?: number;
  pattern?: string;
  maxLength?: number;
  allowedMimeTypes?: string[];
  maxFileSize?: number;
};

// Helper type for pricing agreements structure
export type PricingAgreement = {
  serviceType: string;
  basePrice: number;
  complexity?: { basic?: number; standard?: number; advanced?: number; premium?: number };
  variablePricing?: { perProduct?: number };
  extras?: { vectorization?: number };
};

// Helper type for SLA configuration
export type SLAConfig = {
  [serviceType: string]: {
    days: number;
    hours?: number;
  };
};
