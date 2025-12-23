import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, decimal, integer, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// User roles hierarchy: admin > internal_designer > vendor > vendor_designer > client
export const userRoles = ["admin", "internal_designer", "vendor", "vendor_designer", "client"] as const;
export type UserRole = typeof userRoles[number];

// Client payment methods
export const paymentMethods = ["pay_as_you_go", "monthly_payment", "deduct_from_royalties"] as const;
export type PaymentMethod = typeof paymentMethods[number];

// Pricing structure types for services
export const pricingStructures = ["single", "complexity", "quantity"] as const;
export type PricingStructure = typeof pricingStructures[number];

// Service hierarchy types - father services are standalone, son services add-on to fathers
export const serviceHierarchyTypes = ["father", "son"] as const;
export type ServiceHierarchy = typeof serviceHierarchyTypes[number];

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email"),
  phone: text("phone"),
  role: text("role").notNull().default("client"),
  isActive: boolean("is_active").notNull().default(true),
  // Vendor relationship - links vendor_designer to their parent vendor
  vendorId: varchar("vendor_id"),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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

// Service Packs - monthly subscription packs with service quantities
export const servicePacks = pgTable("service_packs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
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
  userId: varchar("user_id").notNull().references(() => users.id),
  packId: varchar("pack_id").notNull().references(() => servicePacks.id),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  consumedQuantities: jsonb("consumed_quantities"), // { serviceId: consumedCount }
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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

// Bundle request status workflow
export const bundleRequestStatuses = ["pending", "in-progress", "delivered", "change-request"] as const;
export type BundleRequestStatus = typeof bundleRequestStatuses[number];

// Bundle requests - tracks client submissions for bundles
export const bundleRequests = pgTable("bundle_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  bundleId: varchar("bundle_id").notNull().references(() => bundles.id),
  assigneeId: varchar("assignee_id").references(() => users.id),
  assignedAt: timestamp("assigned_at"),
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

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  phone: true,
  role: true,
  vendorId: true,
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

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type VendorProfile = typeof vendorProfiles.$inferSelect;
export type InsertVendorProfile = z.infer<typeof insertVendorProfileSchema>;
export type UpdateVendorProfile = z.infer<typeof updateVendorProfileSchema>;
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
